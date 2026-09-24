// Runs only against an explicitly selected disposable local test database.
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { DriverCoverageService } = require('../dist/src/driver-coverage/driver-coverage.service');
const connectionString = process.env.TENANT_TEST_DATABASE_URL;
const url = new URL(connectionString);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Use a disposable local _test database.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const service = new DriverCoverageService(db);
const userIds = [];
let tenantId;
after(async () => { await db.user.deleteMany({ where: { id: { in: userIds } } }); if (tenantId) await db.tenant.delete({ where: { id: tenantId } }); await db.$disconnect(); });
async function driver(tenantId) {
  const suffix = crypto.randomUUID();
  const user = await db.user.create({ data: { email: `${suffix}@test.invalid`, name: 'M6', passwordHash: 'test', role: 'DRIVER', tenantId, driverProfile: { create: { firstName: 'Test', lastName: 'Driver', phone: suffix, countryCode: 'LB', countryCodes: ['LB', 'CH'], status: 'APPROVED' } } }, include: { driverProfile: true } });
  userIds.push(user.id);
  return user;
}
const route = { fromCountryCode: 'FR', toCountryCode: 'CH' };
const approvedCountry = countryCode => ({ countryCode, canPickup: true, canDropoff: true, status: 'APPROVED' });
const denied = code => e => e.getResponse?.().code === code;
test('reviewed home initialization is pending, idempotent, uses tenant not profile and preserves suspension', async () => {
  const tenant = await db.tenant.create({ data: { code: 'FR', countryCode: 'FR', name: 'France', defaultCurrency: 'EUR', timezone: 'Europe/Paris' } }); tenantId = tenant.id;
  const user = await driver(tenant.id); const id = user.driverProfile.id;
  const initial = await service.initializeHome(id);
  assert.equal(initial.country.countryCode, 'FR'); assert.equal(initial.country.status, 'PENDING'); assert.equal(initial.route.status, 'PENDING');
  await service.reviewCountry(id, { ...approvedCountry('FR'), status: 'SUSPENDED' }, 'admin');
  await service.reviewRoute(id, { fromCountryCode: 'FR', toCountryCode: 'FR', status: 'REJECTED' }, 'admin');
  const again = await service.initializeHome(id);
  assert.equal(again.country.status, 'SUSPENDED'); assert.equal(again.route.status, 'REJECTED');
  assert.equal((await service.list(id)).countries.length, 1);
  assert.equal((await db.user.findUnique({ where: { id: user.id } })).tenantId, tenant.id);
  const legacy = await driver();
  await assert.rejects(service.initializeHome(legacy.driverProfile.id), /reviewed home tenant/);
  assert.deepEqual(await service.list(legacy.driverProfile.id), { countries: [], routes: [] });
});
test('foreign requests cannot grant, expand or reset approval; exact direction and pickup/dropoff are enforced', async () => {
  const user = await driver(tenantId); const id = user.driverProfile.id;
  const foreign = await service.requestCountry(id, { countryCode: ' ch ', canPickup: true, canDropoff: true });
  assert.equal(foreign.status, 'PENDING');
  assert.equal((await service.requestRoute(id, route)).status, 'PENDING');
  await assert.rejects(service.assertApproved(id, 'FR', 'CH'), denied('DRIVER_COUNTRY_NOT_APPROVED'));
  for (const country of ['FR', 'CH']) await service.reviewCountry(id, approvedCountry(country), 'admin');
  for (const status of ['PENDING', 'REJECTED', 'SUSPENDED']) {
    await service.reviewRoute(id, { ...route, status }, 'admin');
    await service.requestRoute(id, route);
    await assert.rejects(service.assertApproved(id, 'FR', 'CH'), denied('DRIVER_ROUTE_NOT_APPROVED'));
  }
  await service.reviewRoute(id, { ...route, status: 'APPROVED' }, 'admin');
  await service.assertApproved(id, 'fr', 'ch');
  await assert.rejects(service.assertApproved(id, 'CH', 'FR'), denied('DRIVER_ROUTE_NOT_APPROVED'));
  for (const status of ['PENDING', 'REJECTED', 'SUSPENDED']) {
    await service.reviewCountry(id, { ...approvedCountry('CH'), status }, 'admin');
    await service.requestCountry(id, approvedCountry('CH'));
    await assert.rejects(service.assertApproved(id, 'FR', 'CH'), denied('DRIVER_COUNTRY_NOT_APPROVED'));
  }
  await service.reviewCountry(id, { ...approvedCountry('CH'), canDropoff: false }, 'admin');
  await service.requestCountry(id, approvedCountry('CH'));
  await assert.rejects(service.assertApproved(id, 'FR', 'CH'), denied('DRIVER_COUNTRY_NOT_APPROVED'));
  await service.reviewCountry(id, approvedCountry('CH'), 'admin');
  await service.reviewCountry(id, { ...approvedCountry('FR'), canPickup: false }, 'admin');
  await assert.rejects(service.assertApproved(id, 'FR', 'CH'), denied('DRIVER_COUNTRY_NOT_APPROVED'));
  const other = await driver(tenantId);
  await assert.rejects(service.assertApproved(other.driverProfile.id, 'FR', 'CH'), denied('DRIVER_COUNTRY_NOT_APPROVED'));
  assert.equal((await service.list(id)).routes[0].reviewedByAdminId, 'admin');
});
test('database uniqueness, foreign keys, same-country and reverse routes', async () => {
  const user = await driver(tenantId); const driverId = user.driverProfile.id;
  const data = { driverId, countryCode: 'LB' };
  await db.driverOperationalCountry.create({ data });
  await assert.rejects(db.driverOperationalCountry.create({ data }), e => e.code === 'P2002');
  await db.driverRoutePermission.create({ data: { driverId, ...route } });
  await assert.rejects(db.driverRoutePermission.create({ data: { driverId, ...route } }), e => e.code === 'P2002');
  await db.driverRoutePermission.create({ data: { driverId, fromCountryCode: 'CH', toCountryCode: 'FR' } });
  await service.reviewCountry(driverId, approvedCountry('LB'), 'admin');
  await service.reviewRoute(driverId, { fromCountryCode: 'LB', toCountryCode: 'LB', status: 'APPROVED' }, 'admin');
  await service.assertApproved(driverId, 'LB', 'LB');
  await assert.rejects(db.driverOperationalCountry.create({ data: { driverId: 'missing', countryCode: 'LB' } }), e => e.code === 'P2003');
  await assert.rejects(service.requestCountry(driverId, { countryCode: 'ZZ', canPickup: true, canDropoff: true }), /Invalid country/);
  await db.user.delete({ where: { id: user.id } });
  assert.equal(await db.driverOperationalCountry.count({ where: { driverId } }), 0);
  assert.equal(await db.driverRoutePermission.count({ where: { driverId } }), 0);
});
