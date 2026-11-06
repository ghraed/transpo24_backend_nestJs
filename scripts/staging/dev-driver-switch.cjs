// Isolated synthetic driver identities. No SMS, push, eligibility or provider acceptance.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { assertRuntime, runtime } = require('./environment.cjs');
assertRuntime();
const { PrismaService } = require('../../dist/src/prisma/prisma.service');
const { hashPassword } = require('../../dist/src/common/security/password.util');
const crypto = require('node:crypto');
const db = new PrismaService();
const file = path.join(runtime, 'dev-driver-switch.json');
const action = process.argv[2];
(async () => {
  let f = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
  if (action === 'prepare') {
    assert.ok(!f, 'Retain existing driver-switch fixture');
    const a = await db.driverProfile.findFirstOrThrow({ where: { user: { email: 'staging-driver@example.invalid' } }, include: { user: true } });
    assert.equal(a.phone, process.env.PLAY_REVIEW_PHONE_NUMBER);
    assert.equal(a.status, 'APPROVED');
    const b = await db.user.create({ data: {
      name: 'Synthetic Driver B', email: 'staging-driver-b@example.invalid', passwordHash: hashPassword(crypto.randomUUID()),
      role: 'DRIVER', countryCode: 'CH', isProfileCompleted: true,
      driverProfile: { create: { firstName: 'Synthetic', lastName: 'Driver B', phone: 'T24_SYNTHETIC_DRIVER_B_UNASSIGNED', countryCode: 'CH', status: 'APPROVED', isProfileCompleted: true } },
    }, include: { driverProfile: true } });
    f = { driverA: a.id, userA: a.userId, driverB: b.driverProfile.id, userB: b.id, originalPhoneA: a.phone, originalPhoneB: b.driverProfile.phone, active: 'a' };
  } else {
    assert.ok(f && ['driver-a', 'driver-b', 'restore'].includes(action));
    const a = await db.driverProfile.findUniqueOrThrow({ where: { id: f.driverA }, include: { user: true } });
    const b = await db.driverProfile.findUniqueOrThrow({ where: { id: f.driverB }, include: { user: true } });
    assert.equal(a.user.email, 'staging-driver@example.invalid');
    assert.equal(b.user.email, 'staging-driver-b@example.invalid');
    assert.ok([f.originalPhoneA, 'T24_SYNTHETIC_DRIVER_A_RETAINED'].includes(a.phone));
    assert.ok([f.originalPhoneA, f.originalPhoneB].includes(b.phone));
    const toB = action === 'driver-b';
    await db.$transaction(async tx => {
      // Distinct non-contact placeholders free the one already-authorized number.
      if (toB) {
        await tx.driverProfile.update({ where: { id: a.id }, data: { phone: 'T24_SYNTHETIC_DRIVER_A_RETAINED' } });
        await tx.driverProfile.update({ where: { id: b.id }, data: { phone: f.originalPhoneA } });
      } else {
        await tx.driverProfile.update({ where: { id: b.id }, data: { phone: f.originalPhoneB } });
        await tx.driverProfile.update({ where: { id: a.id }, data: { phone: f.originalPhoneA } });
      }
    });
    f.active = toB ? 'b' : 'a';
  }
  fs.writeFileSync(file, JSON.stringify(f, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ driverA: f.driverA, driverB: f.driverB, active: f.active, scope: 'Synthetic identity fixtures only; seeded approval is not onboarding acceptance; no outbound contact/provider changes' }));
})().catch(() => { console.error('Driver identity fixture refused or failed; retained private state must be checked.'); process.exitCode = 1; }).finally(() => db.$disconnect());
