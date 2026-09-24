// Run against a disposable migrated local database only; Google calls are mocked.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { CustomerRequestsService } = require('../dist/src/customer-requests/customer-requests.service.js');
const { applyPlan } = require('./tenant-backfill.cjs');
const connectionString = process.env.TENANT_TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set TENANT_TEST_DATABASE_URL to a disposable database.');
const url = new URL(connectionString);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Use a local disposable database ending in _test.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const service = new CustomerRequestsService(prisma, {}, {}, {}, { notifyDriversAboutNewTransportRequest: async () => undefined });
// Matching authorization belongs to subsequent milestones, not this database test.
service.dispatchSubmittedRequestToEligibleDrivers = async () => ({ driverNotifications: [], summary: undefined });
const originalFetch = global.fetch;
const originalKey = process.env.GOOGLE_MAPS_API_KEY;
const users = [];
let customer;
let ch;
let lb;
let vehicle;
const pickupLocation = { latitude: 33.89, longitude: 35.5, address: 'Beirut' };
const deliveryLocation = { latitude: 34.43, longitude: 35.83, address: 'Tripoli' };
before(async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-only';
  global.fetch = async () => ({ ok: true, json: async () => ({ status: 'OK', results: [{ address_components: [{ types: ['country'], short_name: 'LB' }] }] }) });
  await applyPlan(prisma, require('../prisma/fixtures/tenants.development.json'), true);
  ch = await prisma.tenant.findUniqueOrThrow({ where: { code: 'CH' } });
  lb = await prisma.tenant.findUniqueOrThrow({ where: { code: 'LB' } });
  customer = await prisma.user.create({ data: { name: 'Geography test', email: `${randomUUID()}@example.invalid`, passwordHash: 'test-only', tenantId: ch.id } });
  users.push(customer.id);
  for (const key of ['VEHICLE_TRANSPORT', 'MOTORCYCLE_TRANSPORT', 'GOODS_TRANSPORT', 'FURNITURE_TRANSPORT']) {
    const row = await prisma.service.upsert({ where: { key }, create: { key, nameEn: key, nameAr: key, descriptionEn: key, descriptionAr: key, icon: 'test', sortOrder: 1 }, update: { isActive: true } });
    if (key === 'VEHICLE_TRANSPORT') vehicle = row;
  }
});
after(async () => {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
  else process.env.GOOGLE_MAPS_API_KEY = originalKey;
});
async function verify(id) {
  const request = await prisma.transportRequest.findUniqueOrThrow({ where: { id } });
  assert.equal(request.customerTenantId, ch.id);
  assert.equal(request.originTenantId, lb.id);
  assert.equal(request.pickupCountryCode, 'LB');
  assert.equal(request.destinationCountryCode, 'LB');
  assert.equal(request.currency, 'USD');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).tenantId, ch.id);
}
test('vehicle draft owns CH tenant and location updates persist LB geography', async () => {
  const request = await service.createDraftRequest({ customerId: customer.id, serviceId: vehicle.id, vehicleCondition: 'RUNNING' });
  assert.equal(request.customerTenantId, ch.id);
  assert.equal(request.pickupCountryCode, null);
  await service.updatePickupLocation({ customerId: customer.id, requestId: request.id, ...pickupLocation });
  await service.updateDropoffLocation({ customerId: customer.id, requestId: request.id, ...deliveryLocation });
  await verify(request.id);
});
test('motorcycle request persists and returns independent tenant/geography', async () => {
  const request = await service.createMotorcycleTransportRequest({ customerId: customer.id, pickupLocation, deliveryLocation, isImmediate: true, motorcycleType: 'SPORT_BIKE', motorcycleCondition: 'WORKING', requiresSpecialWrapping: false, requiresDedicatedCarrier: false });
  assert.equal(request.destinationCountryCode, 'LB');
  await verify(request.id);
});
test('goods creation, submission and edit preserve geography in PostgreSQL', async () => {
  const request = await service.createGoodsTransportRequest({ customerId: customer.id, pickupLocation, deliveryLocation, isImmediate: true, shipmentSize: 'S', goodsDescription: 'Boxes', approximateWeightKg: 20, numberOfPieces: 2, isFragile: false, requiresRefrigeration: false });
  await verify(request.id);
  await service.submitCustomerRequest({ customerId: customer.id, requestId: request.id });
  const row = await prisma.transportRequest.findUniqueOrThrow({ where: { id: request.id } });
  await service.editCustomerRequest(customer.id, request.id, { serviceId: row.serviceId, updatedAt: row.updatedAt.toISOString(), retainedPhotoIds: [], pickupLocation, dropoffLocation: deliveryLocation, isImmediate: true, requiresLoadingHelp: false }, []);
  await verify(request.id);
});
test('furniture request persists geography alongside photos', async () => {
  const request = await service.createFurnitureTransportRequest({ customerId: customer.id, pickupLocation, deliveryLocation, isImmediate: true, furnitureDescription: 'Sofa', approximateItemCount: 1, movingDate: new Date(Date.now() + 86400000), files: [{ path: '/tmp/geography-test-photo.jpg', originalname: 'photo.jpg', mimetype: 'image/jpeg', size: 100 }] });
  await verify(request.id);
  assert.equal(request.photos.length, 1);
});
test('tenant foreign keys reject forged ownership', async () => {
  await assert.rejects(prisma.transportRequest.create({ data: { customerId: customer.id, serviceId: vehicle.id, customerTenantId: 'nonexistent-tenant' } }), error => error.code === 'P2003');
});

test('concurrent draft edit cannot persist stale resolved countries on submission', async () => {
  const request = await service.createGoodsTransportRequest({ customerId: customer.id, pickupLocation, deliveryLocation, isImmediate: true, shipmentSize: 'S', goodsDescription: 'Boxes', approximateWeightKg: 20, numberOfPieces: 2, isFragile: false, requiresRefrigeration: false });
  const provider = global.fetch;
  let edited = false;
  global.fetch = async (...args) => {
    if (!edited) {
      edited = true;
      await prisma.transportRequest.update({ where: { id: request.id }, data: { pickupLatitude: 48, pickupCountryCode: 'FR' } });
    }
    return provider(...args);
  };
  try {
    await assert.rejects(service.submitCustomerRequest({ customerId: customer.id, requestId: request.id }), error => error.getStatus?.() === 409);
    const row = await prisma.transportRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(row.status, 'DRAFT');
    assert.equal(row.pickupCountryCode, 'FR');
  } finally { global.fetch = provider; }
});

test('location resolution cannot overwrite a concurrently submitted draft', async () => {
  const request = await service.createDraftRequest({ customerId: customer.id, serviceId: vehicle.id, vehicleCondition: 'RUNNING' });
  const provider = global.fetch;
  global.fetch = async (...args) => {
    await prisma.transportRequest.update({ where: { id: request.id }, data: { status: 'PENDING_QUOTES' } });
    return provider(...args);
  };
  try {
    await assert.rejects(service.updatePickupLocation({ customerId: customer.id, requestId: request.id, ...pickupLocation }), error => error.getStatus?.() === 409);
    const row = await prisma.transportRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(row.pickupLatitude, null);
  } finally { global.fetch = provider; }
});

test('route block rejects publication and later edits without mutating an open request', async () => {
  const request = await service.createGoodsTransportRequest({ customerId: customer.id, pickupLocation, deliveryLocation, isImmediate: true, shipmentSize: 'S', goodsDescription: 'Boxes', approximateWeightKg: 20, numberOfPieces: 2, isFragile: false, requiresRefrigeration: false });
  const block = await prisma.routeBlock.create({ data: { fromCountryCode: 'LB', toCountryCode: 'LB', transportType: 'GOODS_TRANSPORT' } });
  try {
    await assert.rejects(service.submitCustomerRequest({ customerId: customer.id, requestId: request.id }), e => e.getResponse().code === 'ROUTE_BLOCKED');
    assert.equal((await prisma.transportRequest.findUniqueOrThrow({ where: { id: request.id } })).status, 'DRAFT');
    await prisma.routeBlock.update({ where: { id: block.id }, data: { isActive: false } });
    await service.submitCustomerRequest({ customerId: customer.id, requestId: request.id });
    const row = await prisma.transportRequest.findUniqueOrThrow({ where: { id: request.id } });
    await prisma.routeBlock.update({ where: { id: block.id }, data: { isActive: true } });
    await assert.rejects(service.editCustomerRequest(customer.id, request.id, { serviceId: row.serviceId, updatedAt: row.updatedAt.toISOString(), retainedPhotoIds: [], pickupLocation, dropoffLocation: deliveryLocation, isImmediate: true, requiresLoadingHelp: false }, []), e => e.getResponse().code === 'ROUTE_BLOCKED');
    const unchanged = await prisma.transportRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(unchanged.updatedAt.toISOString(), row.updatedAt.toISOString());
    assert.equal(unchanged.status, 'PENDING_QUOTES');
  } finally {
    await prisma.routeBlock.delete({ where: { id: block.id } });
  }
});
