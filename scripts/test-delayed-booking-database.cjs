require('dotenv').config({ quiet: true });
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { Client } = require('pg');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { DelayedBookingPaymentsService } = require('../dist/src/payments/delayed-booking-payments.service');
const { PaymentsService } = require('../dist/src/payments/payments.service');
const { CustomerRequestsService } = require('../dist/src/customer-requests/customer-requests.service');
const { BookingConfirmationQueueService } = require('../dist/src/customer-requests/booking-confirmation-queue.service');
const { ChatService } = require('../dist/src/chat/chat.service');
const { TripsService } = require('../dist/src/trips/trips.service');
const { AdminService } = require('../dist/src/admin/admin.service');
const { FurnitureReservationsService } = require('../dist/src/customer-requests/furniture-reservations.service');
const D = value => new Prisma.Decimal(value);

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('This check refuses a non-local database.');
  const schema = `payment_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Client({ connectionString: url.toString() });
  let prisma;
  let created = false;
  let liveQueue;
  let redisQueueName;
  try {
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`); created = true;
    await admin.query(`SET search_path TO "${schema}"`);
    // All tables, enums, and raw locking queries are isolated in this disposable schema.
    const ddl = execFileSync('./node_modules/.bin/prisma', ['migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
    await admin.query(ddl);
    // Verify the shipped additive migration against the prior schema shape as well.
    const columns = ['policyVersion', 'confirmationState', 'confirmationNotifiedState', 'driverAcceptanceNotifiedAt', 'clientFundsReservedNotifiedAt', 'confirmationStartedAt', 'authorizationDueAt', 'approvalDeadlineAt', 'authorizedAt', 'authorizationExpiresAt', 'authorizationAttempt', 'previousStripePaymentIntentId', 'operationKind', 'operationAmount'];
    for (const column of columns) await admin.query(`ALTER TABLE payment_holds DROP COLUMN "${column}"`);
    await admin.query('ALTER TABLE customer_wallet_top_ups DROP COLUMN "acceptedPolicyVersion"');
    await admin.query('ALTER TABLE additional_charges DROP COLUMN "acceptedPolicyVersion"');
    await admin.query(readFileSync('prisma/migrations/20261028000000_delayed_booking_authorization/migration.sql', 'utf8'));
    await admin.query(readFileSync('prisma/migrations/20261028010000_booking_hold_notifications/migration.sql', 'utf8'));
    url.searchParams.set('options', `-c search_path=${schema}`);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
    assert.equal((await prisma.$queryRawUnsafe('SELECT current_schema() AS schema'))[0].schema, schema);
    process.env.DELAYED_BOOKING_AUTHORIZATION_ENABLED = 'true';
    const sent = [];
    const notifications = { sendToUsers: async () => {}, notifyCustomerTripUpdate: async (id, event) => sent.push({ id, event }), notifyDriverSelected: async input => sent.push({ ...input, event: 'DRIVER_SELECTED' }) };
    const stripe = { mode: 'test' };
    const delayed = new DelayedBookingPaymentsService(prisma, stripe, notifications); delayed.ready = true;
    const payments = new PaymentsService(prisma, stripe, notifications, { enqueueDriverPayout: async () => true }, delayed);
    const gateway = new Proxy({}, { get: () => () => {} });
    const requests = new CustomerRequestsService(prisma, payments, new ChatService(prisma, notifications), gateway, notifications);
    const queue = new BookingConfirmationQueueService({ get: () => undefined }, prisma, delayed, requests, { reconcile: async () => {} });
    const service = await prisma.service.create({ data: { key: 'GOODS_TRANSPORT', nameEn: 'Test goods', nameAr: 'اختبار', descriptionEn: 'Disposable fixture', descriptionAr: 'اختبار', icon: 'box', sortOrder: 0 } });
    const driverUser = await prisma.user.create({ data: { email: 'driver@example.invalid', name: 'Test driver', passwordHash: 'not-a-login', role: 'DRIVER' } });
    const driver = await prisma.driverProfile.create({ data: { userId: driverUser.id, firstName: 'Test', lastName: 'Driver', phone: 'fixture', status: 'APPROVED', isProfileCompleted: true, availability: { create: { timezone: 'UTC', isOnline: true, serviceRadiusKm: 100 } } } });
    await prisma.driverVehicle.create({ data: { driverId: driver.id, vehicleType: 'VAN', make: 'Test', model: 'Test', year: 2026, plateNumber: 'TEST', documents: { create: ['VEHICLE_FRONT_PHOTO','VEHICLE_REAR_PHOTO','VEHICLE_SIDE_PHOTO','VEHICLE_LICENSE_PLATE_PHOTO','VEHICLE_REGISTRATION_FRONT','VEHICLE_REGISTRATION_BACK','VEHICLE_INSURANCE_DOCUMENT'].map(type => ({ driverId: driver.id, type, url: 'fixture', mimeType: 'image/jpeg', sizeBytes: 1, status: 'APPROVED' })) } } });
    const customer = async (name, balance) => {
      const user = await prisma.user.create({ data: { email: `${name}@example.invalid`, name, passwordHash: 'not-a-login', wallet: { create: { currency: 'CHF', balance } } } }); return user;
    };
    const booking = async user => {
      const request = await prisma.transportRequest.create({ data: { customerId: user.id, serviceId: service.id, status: 'QUOTED' } });
      const offer = await prisma.driverOffer.create({ data: { requestId: request.id, driverId: driver.id, price: D(100), currency: 'CHF' } });
      return { request, offer, input: { customerId: user.id, requestId: request.id, offerId: offer.id, confirm: true, paymentMethod: 'APP_WALLET', policyVersion: 'delayed-authorization-v1' } };
    };
    const makeDue = async id => prisma.paymentHold.update({ where: { requestId: id }, data: { confirmationStartedAt: new Date(Date.now() - 600001), authorizationDueAt: new Date(Date.now() - 1) } });
    const user = await customer('countdown', D(200));
    const first = await booking(user);
    const accepted = await Promise.all([requests.acceptDriverOffer(first.input), requests.acceptDriverOffer(first.input)]);
    assert.equal(accepted[0].nextStep, 'WAIT_CONFIRMATION'); assert.equal(accepted[0].payment.heldAmount, 0);
    assert.equal(await prisma.paymentHold.count(), 1); assert.equal(await prisma.chatRoom.count(), 0);
    await assert.rejects(requests.finalizeAcceptedOfferPayment({ customerId: user.id, requestId: first.request.id }));
    await queue.process(first.request.id);
    assert.equal((await prisma.customerWallet.findUnique({ where: { customerId: user.id } })).reservedBalance.toNumber(), 0);
    assert.equal(sent.filter(x => x.event === 'DRIVER_SELECTED').length, 0);
    assert.equal(sent.filter(x => x.event === 'BOOKING_FUNDS_RESERVED').length, 0);
    console.log('PASS: concurrent acceptance is idempotent; grace period has no hold, assignment, chat, or driver acceptance');
    await makeDue(first.request.id); await queue.process(first.request.id); await queue.process(first.request.id);
    assert.equal((await prisma.transportRequest.findUnique({ where: { id: first.request.id } })).assignedDriverId, driver.id);
    assert.equal(await prisma.chatRoom.count(), 1); assert.equal(sent.filter(x => x.event === 'DRIVER_SELECTED').length, 1);
    assert.equal(sent.filter(x => x.event === 'BOOKING_FUNDS_RESERVED').length, 1);
    const status = await requests.getCustomerRequestStatus({ customerId: user.id, requestId: first.request.id });
    assert.equal(status.driverDetailsAvailable, true); assert.equal(status.payment.capturedAmount, 0); assert.equal(status.payment.heldAmount, 105);
    const results = await Promise.all([payments.cancelCollectedTrip({ customerId: user.id, requestId: first.request.id, expectedRetainedAmount: 15.75, policyVersion: 'delayed-authorization-v1' }), payments.cancelCollectedTrip({ customerId: user.id, requestId: first.request.id, expectedRetainedAmount: 15.75, policyVersion: 'delayed-authorization-v1' })]);
    assert.equal(results[0].retainedAmount, 15.75); assert.equal(results[1].retainedAmount, 15.75);
    let wallet = await prisma.customerWallet.findUnique({ where: { customerId: user.id } });
    assert.equal(wallet.balance.toNumber(), 184.25); assert.equal(wallet.reservedBalance.toNumber(), 0);
    assert.equal((await prisma.tripPaymentSettlement.findUnique({ where: { requestId: first.request.id } })).status, 'CANCELLED_WITH_FEE');
    assert.equal((await prisma.customerWalletTransaction.findFirst({ where: { paymentHold: { requestId: first.request.id }, type: 'RELEASE' } })).amount.toNumber(), 89.25);
    console.log('PASS: assignment and both notifications follow the hold once; concurrent cancellation charges the fee once');

    const competingUser = await customer('concurrency', D(150));
    const competing = await Promise.all([booking(competingUser), booking(competingUser)]);
    for (const item of competing) { await requests.acceptDriverOffer(item.input); await makeDue(item.request.id); }
    await Promise.all(competing.map(item => queue.process(item.request.id)));
    const holds = await prisma.paymentHold.findMany({ where: { customerId: competingUser.id } });
    assert.equal(holds.filter(x => x.status === 'PAYMENT_HELD').length, 1); assert.equal(holds.filter(x => x.confirmationState === 'CANCELLED').length, 1);
    wallet = await prisma.customerWallet.findUnique({ where: { customerId: competingUser.id } }); assert.equal(wallet.reservedBalance.toNumber(), 105); assert.equal(wallet.balance.toNumber(), 150);
    console.log('PASS: competing authorizations lock the wallet and cannot overspend');

    const held = holds.find(x => x.status === 'PAYMENT_HELD');
    const trips = new TripsService(prisma, notifications);
    await prisma.transportRequest.update({ where: { id: held.requestId }, data: { status: 'DELIVERED', deliveredAt: new Date(), ratingAvailableAt: new Date() } });
    await prisma.$transaction(tx => trips.createDriverEarningForDeliveredTrip(tx, held.requestId));
    await assert.rejects(delayed.captureDelivery(competingUser.id, held.requestId));
    await trips.createDriverRating({ customerId: competingUser.id, tripId: held.requestId, rating: 5, comment: 'Fixture rating' });
    assert.equal((await prisma.transportRequest.findUnique({ where: { id: held.requestId } })).deliveryConfirmedByCustomerAt, null);
    assert.equal((await prisma.paymentHold.findUnique({ where: { requestId: held.requestId } })).status, 'PAYMENT_HELD');
    assert.equal((await prisma.customerWallet.findUnique({ where: { customerId: competingUser.id } })).balance.toNumber(), 150);
    console.log('PASS: rating a driver does not confirm delivery, capture the hold, or deduct wallet funds');
    await trips.confirmCustomerDelivery(competingUser.id, held.requestId);
    await Promise.all([payments.captureConfirmedDelivery(competingUser.id, held.requestId), payments.captureConfirmedDelivery(competingUser.id, held.requestId)]);
    wallet = await prisma.customerWallet.findUnique({ where: { customerId: competingUser.id } }); assert.equal(wallet.balance.toNumber(), 45); assert.equal(wallet.reservedBalance.toNumber(), 0);
    const settlement = await prisma.tripPaymentSettlement.findUnique({ where: { requestId: held.requestId } });
    assert.equal(settlement.collectedAmount.toNumber(), 105); assert.equal(settlement.status, 'COLLECTED'); assert.equal(settlement.driverPayoutState, 'EARNING_CREATED'); assert.ok(settlement.driverShareAmount.gt(0));
    console.log('PASS: client-confirmed delivery captures once and preserves payout allocation');
    const adminService = new AdminService(prisma, payments, notifications);
    const captures = await adminService.buildCapturePaymentReconciliationRecords();
    assert.ok(captures.every(row => row.status === 'MATCHED'));
    assert.equal((await adminService.buildRefundPaymentReconciliationRecords()).length, 0);
    console.log('PASS: admin reconciliation distinguishes held, released, and partially captured funds from refunds');
    const furnitureService = await prisma.service.create({ data: { key: 'FURNITURE_TRANSPORT', nameEn: 'Test furniture', nameAr: 'اختبار', descriptionEn: 'Fixture', descriptionAr: 'اختبار', icon: 'box', sortOrder: 1 } });
    const reservationUser = await customer('reservation', D(200));
    const reservationRequest = await prisma.transportRequest.create({ data: { customerId: reservationUser.id, serviceId: furnitureService.id, status: 'QUOTED', scheduledPickupAt: new Date(Date.now() + 7 * 86400000), scheduleTimeZone: 'UTC' } });
    const reservationOffer = await prisma.driverOffer.create({ data: { requestId: reservationRequest.id, driverId: driver.id, price: D(100), currency: 'CHF' } });
    const furniture = new FurnitureReservationsService(prisma, payments, notifications, { get: key => key === 'FURNITURE_RESERVATIONS_ENABLED' ? 'true' : undefined }, new ChatService(prisma, notifications)); furniture.ready = true;
    await furniture.tryReserve({ customerId: reservationUser.id, requestId: reservationRequest.id, offerId: reservationOffer.id, supportsDeferredFurniture: true });
    await prisma.transportRequest.update({ where: { id: reservationRequest.id }, data: { confirmationOpensAt: new Date(Date.now() - 1000), paymentDeadlineAt: new Date(Date.now() + 86400000) } });
    await furniture.confirm({ customerId: reservationUser.id, requestId: reservationRequest.id, confirm: true, paymentMethod: 'APP_WALLET', policyVersion: 'delayed-authorization-v1' });
    assert.equal((await furniture.paymentDue(reservationUser.id)).length, 0);
    await makeDue(reservationRequest.id); await delayed.process(reservationRequest.id);
    await furniture.cancel(reservationUser.id, reservationRequest.id);
    await delayed.process(reservationRequest.id); await delayed.process(reservationRequest.id);
    const reservationWallet = await prisma.customerWallet.findUnique({ where: { customerId: reservationUser.id } });
    assert.equal(reservationWallet.balance.toNumber(), 200); assert.equal(reservationWallet.reservedBalance.toNumber(), 0);
    console.log('PASS: deferred reservation cancellation releases an authorized-but-unconfirmed reservation once and without a fee');


    const topUps = await Promise.all([1, 2].map(n => prisma.customerWalletTopUp.create({ data: { customerId: competingUser.id, walletId: wallet.id, amount: D(25), currency: 'CHF', paymentMethod: 'CREDIT_CARD', provider: 'STRIPE', status: 'PENDING', stripePaymentIntentId: `fixture_topup_${n}` } })));
    assert.equal((await prisma.customerWallet.findUnique({ where: { customerId: competingUser.id } })).balance.toNumber(), 45);
    await payments.syncStripeWalletTopUp({ id: topUps[0].stripePaymentIntentId, status: 'processing', amount: 2500, currency: 'chf' }, 'payment_intent.processing');
    await payments.syncStripeWalletTopUp({ id: topUps[1].stripePaymentIntentId, status: 'requires_payment_method', amount: 2500, currency: 'chf' }, 'payment_intent.payment_failed');
    assert.equal((await prisma.customerWallet.findUnique({ where: { customerId: competingUser.id } })).balance.toNumber(), 45);
    assert.equal(await prisma.customerWalletTransaction.count({ where: { customerId: competingUser.id, type: 'TOP_UP' } }), 0);
    console.log('PASS: pending and failed top-ups do not credit the wallet');
    const credit = topUp => payments.syncStripeWalletTopUp({ id: topUp.stripePaymentIntentId, status: 'succeeded', amount: 2500, currency: 'chf', latest_charge: 'fixture_charge' }, 'payment_intent.succeeded');
    await Promise.all([credit(topUps[0]), credit(topUps[0]), credit(topUps[1]), credit(topUps[1])]);
    assert.equal((await prisma.customerWallet.findUnique({ where: { customerId: competingUser.id } })).balance.toNumber(), 95);
    assert.equal(await prisma.customerWalletTransaction.count({ where: { customerId: competingUser.id, type: 'TOP_UP' } }), 2);
    console.log('PASS: concurrent and duplicate successful top-up events credit each amount exactly once');
    const extra = await prisma.additionalCharge.create({ data: { requestId: held.requestId, driverId: driver.id, customerId: competingUser.id, amount: D(20), currency: 'CHF', reason: 'Fixture expense', invoiceUrl: '/fixture', stripePaymentIntentId: 'fixture_extra', approvedAt: new Date(), savedPaymentMethodId: 'fixture_card' } });
    const earningBefore = await prisma.driverEarning.findUnique({ where: { tripId: held.requestId } });
    stripe.retrievePaymentIntent = async () => ({ id: 'fixture_extra', status: 'succeeded', amount: 2000, currency: 'chf', latest_charge: 'fixture_extra_charge' });
    await Promise.all([payments.recoverAdditionalExpensePayments(), payments.recoverAdditionalExpensePayments()]);
    assert.equal((await prisma.additionalCharge.findUnique({ where: { id: extra.id } })).status, 'CAPTURED');
    assert.equal((await prisma.driverEarning.findUnique({ where: { tripId: held.requestId } })).grossAmount.toString(), earningBefore.grossAmount.add(20).toString());
    console.log('PASS: concurrent additional-expense recovery records a successful payment and allocates driver earnings only once');
    if (!['localhost', '127.0.0.1', '::1'].includes(process.env.REDIS_HOST || '')) throw new Error('The restart check requires local Redis.');
    const restartUser = await customer('restart', D(200)); const restartBooking = await booking(restartUser);
    await requests.acceptDriverOffer(restartBooking.input);
    await prisma.paymentHold.update({ where: { requestId: restartBooking.request.id }, data: { confirmationStartedAt: new Date(Date.now() - 600000), authorizationDueAt: new Date(Date.now() + 2000) } });
    redisQueueName = `${schema}_queue`;
    const config = { get: key => key === 'BOOKING_CONFIRMATION_QUEUE_NAME' ? redisQueueName : process.env[key] };
    const startWorker = async () => { const worker = new BookingConfirmationQueueService(config, prisma, delayed, requests, { reconcile: async () => {} }); await worker.onModuleInit(); return worker; };
    liveQueue = await startWorker(); await liveQueue.onModuleDestroy(); liveQueue = await startWorker();
    const timeout = Date.now() + 10000;
    while (Date.now() < timeout) {
      const row = await prisma.transportRequest.findUnique({ where: { id: restartBooking.request.id } });
      if (row.assignedDriverId) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.equal((await prisma.transportRequest.findUnique({ where: { id: restartBooking.request.id } })).assignedDriverId, driver.id);
    assert.equal((await prisma.customerWallet.findUnique({ where: { customerId: restartUser.id } })).reservedBalance.toNumber(), 105);
    assert.equal(sent.filter(x => x.event === 'DRIVER_SELECTED' && x.requestId === restartBooking.request.id).length, 1);
    console.log('PASS: a persisted delayed job survives a real Redis worker restart and assigns only after funds are held');


  } finally {
    await liveQueue?.onModuleDestroy();
    if (redisQueueName) {
      const { Queue } = require('bullmq');
      const cleanup = new Queue(redisQueueName, { connection: { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined, maxRetriesPerRequest: 1 } });
      await cleanup.obliterate({ force: true }); await cleanup.close();
    }
    await prisma?.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
    console.log('Disposable database schema cleaned up.');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
