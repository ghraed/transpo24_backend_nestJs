// Unaccepted synthetic quotes only. Native Dev UI and real workers perform payments.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { runtime, assertRuntime } = require('./environment.cjs');
assertRuntime();
const { PrismaService } = require('../../dist/src/prisma/prisma.service');
const db = new PrismaService();
(async () => {
  const file = path.join(runtime, 'native-payment-fixtures.json');
  const f = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(!f.requests.some(row => row.purpose.startsWith('native-dev-')), 'Preserve existing Dev financial fixtures');
  const customer = await db.user.findUniqueOrThrow({ where: { id: f.customerId } });
  assert.equal(customer.email, 'staging-customer@example.invalid');
  assert.equal(customer.stripeCustomerId, f.stripeCustomerId);
  const original = f.requests.find(row => row.purpose === 'native-3ds-approve');
  const prior = await db.transportRequest.findUniqueOrThrow({ where: { id: original.requestId } });
  const offer = await db.driverOffer.findUniqueOrThrow({ where: { id: original.offerId } });
  const driver = await db.driverProfile.findUniqueOrThrow({ where: { id: offer.driverId }, include: { user: true } });
  assert.equal(driver.user.email, 'staging-driver@example.invalid');
  assert.equal(driver.stripeAccountId, f.accountId);
  const previous = path.join(runtime, 'native-payment-fixtures.before-dev.json');
  assert.ok(!fs.existsSync(previous), 'Prior Dev seed checkpoint preserved');
  fs.copyFileSync(file, previous); fs.chmodSync(previous, 0o600);
  const fields = ['customerId', 'serviceId', 'isImmediate', 'itemType', 'goodsDescription', 'goodsApproximateWeightKg', 'goodsNumberOfPieces', 'goodsShipmentSize', 'itemWeightKg', 'currency', 'pickupAddress', 'dropoffAddress', 'pickupLatitude', 'pickupLongitude', 'dropoffLatitude', 'dropoffLongitude'];
  const data = Object.fromEntries(fields.map(key => [key, prior[key]]));
  await db.driverAvailability.update({ where: { driverId: driver.id }, data: { isOnline: true } });
  for (const purpose of ['native-dev-capture', 'native-dev-cancellation']) {
    const request = await db.transportRequest.create({ data: { ...data, status: 'QUOTED', itemTitle: 'SYNTHETIC ' + purpose, submittedAt: new Date() } });
    const fresh = await db.driverOffer.create({ data: { requestId: request.id, driverId: driver.id, price: 10, currency: 'CHF', status: 'PENDING', estimatedPickupAt: new Date(Date.now() + 3600000), estimatedDeliveryAt: new Date(Date.now() + 7200000) } });
    f.requests.push({ purpose, requestId: request.id, offerId: fresh.id });
    fs.writeFileSync(file, JSON.stringify(f, null, 2), { mode: 0o600 });
  }
  console.log('Prepared two owned unaccepted Dev quotes using the retained synthetic TEST customer/card. No authorization/capture seeded; eligibility is not onboarding acceptance.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
