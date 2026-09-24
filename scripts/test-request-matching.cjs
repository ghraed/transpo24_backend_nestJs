// Explicit disposable database only. No production URL fallback.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { PrismaClient, DayOfWeek } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { MatchingService } = require('../dist/src/matching/matching.service');
const { CustomerRequestsService } = require('../dist/src/customer-requests/customer-requests.service');
const { DriverService } = require('../dist/src/driver/driver.service');
const { RequestMatchingQueueService } = require('../dist/src/customer-requests/request-matching-queue.service');
const connectionString = process.env.TENANT_TEST_DATABASE_URL;
const url = new URL(connectionString);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Use a disposable local _test database.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const matching = new MatchingService(db);
const users = [], tenants = [], ownedTenantIds = [], requests = [], blocks = [];
let ownsService = false;
let driver, customer, service, vehicle, foreignTenant;
const events = [], pushes = [];
const gateway = { getDriverConnectionCount: () => 1, emitRequestNew: (...args) => events.push(args) };
const notifications = { notifyDriversAboutNewTransportRequest: async data => pushes.push(...data.drivers) };
const customerService = new CustomerRequestsService(db, {}, {}, gateway, notifications);
const driverService = new DriverService(db, gateway, notifications);
const worker = new RequestMatchingQueueService({ get: () => undefined }, customerService);
const docs = ['VEHICLE_FRONT_PHOTO', 'VEHICLE_REAR_PHOTO', 'VEHICLE_SIDE_PHOTO', 'VEHICLE_LICENSE_PLATE_PHOTO', 'VEHICLE_REGISTRATION_FRONT', 'VEHICLE_REGISTRATION_BACK', 'VEHICLE_INSURANCE_DOCUMENT'];
const route = { fromCountryCode: 'CH', toCountryCode: 'CH' };
async function request(extra = {}) {
  const row = await db.transportRequest.create({ data: {
    customerId: customer.id, customerTenantId: customer.tenantId, originTenantId: foreignTenant.id,
    serviceId: service.id, status: 'PENDING_QUOTES', pickupCountryCode: 'CH', destinationCountryCode: 'CH', currency: 'CHF',
    isImmediate: true, pickupLatitude: 47.38, pickupLongitude: 8.54, dropoffLatitude: 47.4, dropoffLongitude: 8.6,
    itemTitle: 'Boxes', itemType: 'GOODS', itemWeightKg: 100, ...extra,
  }, include: { service: true } }); requests.push(row.id); return row;
}
before(async () => {
  for (const code of ['FR', 'CH']) {
    let tenant = await db.tenant.findUnique({ where: { countryCode: code } });
    if (!tenant) { tenant = await db.tenant.create({ data: { code, countryCode: code, name: code, defaultCurrency: code === 'CH' ? 'CHF' : 'EUR', timezone: 'UTC' } }); ownedTenantIds.push(tenant.id); }
    tenants.push(tenant);
  }
  foreignTenant = tenants[1];
  customer = await db.user.create({ data: { name: 'Customer', email: `${crypto.randomUUID()}@test.invalid`, passwordHash: 'test', tenantId: foreignTenant.id } }); users.push(customer.id);
  const user = await db.user.create({ data: { name: 'Driver', email: `${crypto.randomUUID()}@test.invalid`, passwordHash: 'test', role: 'DRIVER', tenantId: tenants[0].id,
    driverProfile: { create: { firstName: 'Border', lastName: 'Driver', phone: crypto.randomUUID(), status: 'APPROVED', isProfileCompleted: true,
      availability: { create: { timezone: 'UTC', isOnline: true, serviceRadiusKm: 30, baseLatitude: 47.38, baseLongitude: 8.54,
        schedule: { create: Object.values(DayOfWeek).map(dayOfWeek => ({ dayOfWeek, isAvailable: true, startTime: '00:00', endTime: '24:00' })) } } },
      operationalCountries: { create: { countryCode: 'CH', status: 'APPROVED', canPickup: true, canDropoff: true } },
      routePermissions: { create: { ...route, status: 'APPROVED' } },
    } },
  }, include: { driverProfile: true } }); users.push(user.id); driver = user.driverProfile;
  vehicle = await db.driverVehicle.create({ data: { driverId: driver.id, vehicleType: 'VAN', make: 'Test', model: 'Test', year: 2026, plateNumber: crypto.randomUUID(), capacityKg: 1000, allowedCargoTypes: ['GOODS'], dimensionsAreStandard: true,
    documents: { create: docs.map(type => ({ driverId: driver.id, type, url: 'test.jpg', mimeType: 'image/jpeg', sizeBytes: 1, status: 'APPROVED' })) },
  } });
  service = await db.service.findUnique({ where: { key: 'GOODS_TRANSPORT' } });
  if (!service) { ownsService = true; service = await db.service.create({ data: { key: 'GOODS_TRANSPORT', nameEn: 'Goods', nameAr: 'Goods', descriptionEn: 'Test', descriptionAr: 'Test', icon: 'test', sortOrder: 1 } }); }
});
after(async () => {
  await db.routeBlock.deleteMany({ where: { id: { in: blocks } } });
  await db.transportRequest.deleteMany({ where: { id: { in: requests } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  if (ownsService && service) await db.service.delete({ where: { id: service.id } });
  await db.tenant.deleteMany({ where: { id: { in: ownedTenantIds } } });
  await db.$disconnect();
});
test('FR driver matches CH request without changing tenant; candidate upsert is unique and request-specific', async () => {
  const row = await request();
  assert.deepEqual((await matching.driversForRequest(row)).map(d => d.id), [driver.id]);
  await Promise.all([matching.activate(row.id, driver.id), matching.activate(row.id, driver.id)]);
  assert.equal(await db.driverRequestAlert.count({ where: { requestId: row.id, driverId: driver.id } }), 1);
  assert.equal(await matching.canDiscover(row, driver.id), true);
  const unrelated = await request();
  assert.equal(await matching.canDiscover(unrelated, driver.id), false);
  await assert.rejects(driverService.getDriverRequestDetails({ userId: driver.userId, requestId: unrelated.id }), /not available/);
  assert.equal((await db.user.findUnique({ where: { id: driver.userId } })).tenantId, tenants[0].id);
});
test('queued retry reloads state, produces one candidate/event, and newly blocked work produces none', async () => {
  const row = await request(); events.length = 0; pushes.length = 0;
  await Promise.all([worker.process({ requestId: row.id }), worker.process({ requestId: row.id })]);
  assert.equal(await db.driverRequestAlert.count({ where: { requestId: row.id, isActive: true } }), 1);
  assert.equal(events.length, 1); assert.equal(pushes.length, 1);
  const pending = await request();
  const block = await db.routeBlock.create({ data: { ...route } }); blocks.push(block.id);
  await worker.process({ requestId: pending.id });
  assert.equal(await db.driverRequestAlert.count({ where: { requestId: pending.id } }), 0);
  assert.equal(await matching.canDiscover(row, driver.id), false);
  assert.equal(events.length, 1); assert.equal(pushes.length, 1);
  await db.routeBlock.update({ where: { id: block.id }, data: { isActive: false } });
  await worker.process({ requestId: pending.id });
  assert.equal(await matching.canDiscover(pending, driver.id), true);
});
test('revoked countries/routes and pickup/dropoff flags immediately stop eligibility and discovery', async () => {
  const row = await request(); await matching.activate(row.id, driver.id);
  for (const status of ['PENDING', 'REJECTED', 'SUSPENDED']) {
    await db.driverRoutePermission.updateMany({ where: { driverId: driver.id }, data: { status } });
    assert.equal((await matching.driversForRequest(row)).length, 0);
    assert.equal(await matching.canDiscover(row, driver.id), false);
  }
  await db.driverRoutePermission.updateMany({ where: { driverId: driver.id }, data: { status: 'APPROVED' } });
  for (const data of [{ status: 'PENDING' }, { status: 'SUSPENDED' }, { canPickup: false }, { canDropoff: false }]) {
    await db.driverOperationalCountry.updateMany({ where: { driverId: driver.id }, data });
    assert.equal((await matching.driversForRequest(row)).length, 0);
    assert.equal(await matching.canDiscover(row, driver.id), false);
    await db.driverOperationalCountry.updateMany({ where: { driverId: driver.id }, data: { status: 'APPROVED', canPickup: true, canDropoff: true } });
  }
});
test('type-specific blocks and exact route direction; missing geography fails closed', async () => {
  const row = await request();
  const block = await db.routeBlock.create({ data: { ...route, transportType: 'FURNITURE_TRANSPORT' } }); blocks.push(block.id);
  assert.equal((await matching.driversForRequest(row)).length, 1);
  await db.routeBlock.update({ where: { id: block.id }, data: { transportType: 'GOODS_TRANSPORT' } });
  assert.equal((await matching.driversForRequest(row)).length, 0);
  await db.routeBlock.update({ where: { id: block.id }, data: { isActive: false } });
  assert.equal((await matching.driversForRequest({ ...row, pickupCountryCode: null })).length, 0);
  await db.driverOperationalCountry.create({ data: { driverId: driver.id, countryCode: 'FR', status: 'APPROVED' } });
  await db.driverRoutePermission.create({ data: { driverId: driver.id, fromCountryCode: 'FR', toCountryCode: 'CH', status: 'APPROVED' } });
  assert.equal((await matching.driversForRequest({ ...row, pickupCountryCode: 'FR' })).length, 1);
  assert.equal((await matching.driversForRequest({ ...row, destinationCountryCode: 'FR' })).length, 0);
});
test('existing offers and ignored alerts do not create new matches; accepted jobs are untouched', async () => {
  const row = await request();
  await db.driverOffer.create({ data: { requestId: row.id, driverId: driver.id, price: 100, currency: 'CHF' } });
  assert.equal((await matching.driversForRequest(row)).length, 0);
  const ignored = await request(); await db.driverRequestAlert.create({ data: { requestId: ignored.id, driverId: driver.id, status: 'IGNORED' } });
  assert.equal((await matching.driversForRequest(ignored)).length, 0);
  const accepted = await request({ status: 'ACCEPTED', assignedDriverId: driver.id });
  await worker.process({ requestId: accepted.id });
  assert.equal((await db.transportRequest.findUnique({ where: { id: accepted.id } })).status, 'ACCEPTED');
  assert.equal(await db.driverRequestAlert.count({ where: { requestId: accepted.id } }), 0);
});
test('refresh handles more than one page, respects policy, and legacy alerts are not implicit candidates', async () => {
  const row = await request();
  const legacy = await db.driverRequestAlert.create({ data: { requestId: row.id, driverId: driver.id } });
  assert.equal(legacy.isActive, false); assert.equal(legacy.matchedAt, null);
  assert.equal(await matching.canDiscover(row, driver.id), false);
  for (let i = 0; i < 105; i++) await request();
  await matching.refreshDriver(driver.id);
  assert.equal(await matching.canDiscover(row, driver.id), true);
  assert.ok(await db.driverRequestAlert.count({ where: { driverId: driver.id, isActive: true } }) >= 106);
  const blocked = await request();
  const block = await db.routeBlock.create({ data: route }); blocks.push(block.id);
  await matching.refreshDriver(driver.id);
  assert.equal(await db.driverRequestAlert.count({ where: { requestId: blocked.id } }), 0);
  await db.routeBlock.update({ where: { id: block.id }, data: { isActive: false } });
});
test('active profile, documents, capacity, location, schedule and online state remain enforced', async () => {
  const row = await request();
  for (const status of ['SUSPENDED', 'PENDING_REVIEW']) {
    await db.driverProfile.update({ where: { id: driver.id }, data: { status } });
    assert.equal((await matching.driversForRequest(row)).length, 0);
  }
  await db.driverProfile.update({ where: { id: driver.id }, data: { status: 'APPROVED' } });
  for (const data of [{ isOnline: false }, { baseLatitude: 0 }, { acceptsImmediateRequests: false }]) {
    await db.driverAvailability.update({ where: { driverId: driver.id }, data });
    assert.equal((await matching.driversForRequest(row)).length, 0);
    await db.driverAvailability.update({ where: { driverId: driver.id }, data: { isOnline: true, baseLatitude: 47.38, acceptsImmediateRequests: true } });
  }
  await db.driverDocument.updateMany({ where: { vehicleId: vehicle.id, type: docs[0] }, data: { status: 'REJECTED' } });
  assert.equal((await matching.driversForRequest(row)).length, 0);
  await db.driverDocument.updateMany({ where: { vehicleId: vehicle.id }, data: { status: 'APPROVED' } });
  assert.equal((await matching.driversForRequest({ ...row, itemWeightKg: 99999 })).length, 0);
  await db.driverAvailabilitySchedule.updateMany({ where: { availability: { driverId: driver.id } }, data: { isAvailable: false } });
  assert.equal((await matching.driversForRequest(row)).length, 0);
  await db.driverAvailabilitySchedule.updateMany({ where: { availability: { driverId: driver.id } }, data: { isAvailable: true } });
  await db.user.update({ where: { id: driver.userId }, data: { deletedAt: new Date() } });
  assert.equal((await matching.driversForRequest(row)).length, 0);
  await db.user.update({ where: { id: driver.userId }, data: { deletedAt: null } });
});

test('BullMQ delivers ID-only work through a real isolated Redis worker', { skip: !process.env.MATCHING_TEST_REDIS_PORT }, async () => {
  const port = Number(process.env.MATCHING_TEST_REDIS_PORT);
  assert.ok(Number.isInteger(port) && port > 1024 && port !== 6379, 'Use an explicitly isolated Redis port');
  const row = await request();
  let finish, fail;
  const completed = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  const config = { MATCHING_QUEUE_ENABLED: 'true', REDIS_HOST: '127.0.0.1', REDIS_PORT: String(port) };
  const live = new RequestMatchingQueueService({ get: key => config[key] }, { matchPublishedRequest: async id => {
    try { assert.equal(id, row.id); await customerService.matchPublishedRequest(id); finish(); }
    catch (error) { fail(error); throw error; }
  } });
  let timer;
  try {
    live.onModuleInit();
    assert.equal(await live.enqueue(row.id), true);
    await Promise.race([completed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Worker timed out')), 10000); })]);
    assert.equal(await matching.canDiscover(row, driver.id), true);
  } finally { clearTimeout(timer); await live.onModuleDestroy(); }
});
