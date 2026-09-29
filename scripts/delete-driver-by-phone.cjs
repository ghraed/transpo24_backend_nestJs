require('dotenv/config');

const { unlink } = require('node:fs/promises');
const { resolve, sep } = require('node:path');
const { PrismaClient, UserRole } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const PHONE = '+96171251044';
const apply = process.argv.includes('--apply');

if (process.argv.slice(2).some((arg) => arg !== '--apply')) {
  throw new Error('Usage: node scripts/delete-driver-by-phone.cjs [--apply]');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const driverSelect = {
  id: true,
  userId: true,
  profilePhotoUrl: true,
  user: { select: { role: true } },
  documents: { select: { storageKey: true } },
  assignedRequests: {
    select: {
      id: true,
      status: true,
      customerId: true,
      photos: { select: { storageKey: true } },
      proofPhotos: { select: { storageKey: true } },
      chatRoom: { select: { messages: { select: { attachmentUrl: true } } } },
    },
  },
};

function assertDriver(driver) {
  if (driver.user.role !== UserRole.DRIVER) {
    throw new Error('The matching profile does not belong to a driver account.');
  }
}

function localUploadPath(value) {
  if (typeof value !== 'string') return null;
  const key = value.replace(/^\/+/, '');
  if (!key.startsWith('uploads/')) return null;
  const root = resolve(process.cwd(), 'uploads');
  const path = resolve(process.cwd(), key);
  return path.startsWith(`${root}${sep}`) ? path : null;
}

async function preview() {
  const driver = await prisma.driverProfile.findUnique({
    where: { phone: PHONE },
    select: driverSelect,
  });
  if (!driver) {
    console.log(`No driver profile found for ${PHONE}.`);
    return null;
  }
  assertDriver(driver);
  const requestStatuses = driver.assignedRequests.reduce((counts, request) => {
    counts[request.status] = (counts[request.status] || 0) + 1;
    return counts;
  }, {});
  console.log(JSON.stringify({
    phone: PHONE,
    driverId: driver.id,
    userId: driver.userId,
    assignedJobs: driver.assignedRequests.length,
    assignedJobStatuses: requestStatuses,
    driverDocuments: driver.documents.length,
    action: apply ? 'hard delete' : 'preview only',
  }, null, 2));
  return driver;
}

async function deleteDriver(expected) {
  return prisma.$transaction(async (tx) => {
    const driver = await tx.driverProfile.findUnique({
      where: { phone: PHONE },
      select: driverSelect,
    });
    if (!driver || driver.id !== expected.id || driver.userId !== expected.userId) {
      throw new Error('Driver changed since preview; deletion aborted.');
    }
    assertDriver(driver);

    const jobIds = driver.assignedRequests.map((job) => job.id);
    const jobIdSet = new Set(jobIds);
    const customerIds = [...new Set(driver.assignedRequests.map((job) => job.customerId))];
    const holds = await tx.paymentHold.findMany({
      where: { driverId: driver.id },
      select: { id: true },
    });
    const charges = await tx.additionalCharge.findMany({
      where: { driverId: driver.id },
      select: { id: true, invoiceStorageKey: true },
    });
    const holdIds = holds.map((hold) => hold.id);
    const chargeIds = charges.map((charge) => charge.id);
    const files = new Set([
      driver.profilePhotoUrl,
      ...driver.documents.map((document) => document.storageKey),
      ...charges.map((charge) => charge.invoiceStorageKey),
      ...driver.assignedRequests.flatMap((job) => [
        ...job.photos.map((photo) => photo.storageKey),
        ...job.proofPhotos.map((photo) => photo.storageKey),
        ...(job.chatRoom?.messages.map((message) => message.attachmentUrl) ?? []),
      ]),
    ].map(localUploadPath).filter(Boolean));

    const notifications = await tx.customerNotification.findMany({
      where: { userId: { in: customerIds } },
      select: { id: true, data: true },
    });
    const notificationIds = notifications
      .filter(({ data }) => data && typeof data === 'object' && [
        data.requestId,
        data.tripId,
        data.transportRequestId,
      ].some((id) => jobIdSet.has(id)))
      .map(({ id }) => id);
    const deletedNotifications = await tx.customerNotification.deleteMany({
      where: { id: { in: notificationIds } },
    });

    const reconciliation = await tx.paymentReconciliationRecord.deleteMany({
      where: {
        OR: [
          { driverId: driver.id },
          { driverId: driver.userId },
          { tripId: { in: jobIds } },
        ],
      },
    });
    const walletTransactions = await tx.customerWalletTransaction.deleteMany({
      where: {
        OR: [
          { paymentHoldId: { in: holdIds } },
          { additionalChargeId: { in: chargeIds } },
        ],
      },
    });
    const jobs = await tx.transportRequest.deleteMany({
      where: { id: { in: jobIds }, assignedDriverId: driver.id },
    });
    if (jobs.count !== jobIds.length) {
      throw new Error('Assigned jobs changed during deletion; transaction rolled back.');
    }
    await tx.user.delete({ where: { id: driver.userId } });

    return {
      driverId: driver.id,
      userId: driver.userId,
      deletedJobs: jobs.count,
      deletedReconciliationRecords: reconciliation.count,
      deletedJobNotifications: deletedNotifications.count,
      deletedWalletTransactions: walletTransactions.count,
      filePaths: [...files],
    };
  }, { timeout: 30000 });
}

async function main() {
  const driver = await preview();
  if (!driver || !apply) return;

  const result = await deleteDriver(driver);
  const fileFailures = [];
  for (const path of result.filePaths) {
    try {
      await unlink(path);
    } catch (error) {
      if (error.code !== 'ENOENT') fileFailures.push(path);
    }
  }
  const { filePaths, ...summary } = result;
  console.log(JSON.stringify({ ...summary, localFilesRemoved: filePaths.length - fileFailures.length, fileFailures }, null, 2));
  if (fileFailures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
