// Only a disposable local test database is permitted. Applies no production mutations.
const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { PrismaClient, ServiceKey } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { RoutePolicyService } = require('../dist/src/route-policy/route-policy.service');
const connectionString = process.env.TENANT_TEST_DATABASE_URL;
const url = new URL(connectionString);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Use a disposable local _test database.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const policy = new RoutePolicyService(db);
const ids = [];
after(async () => { await db.routeBlock.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); });
const route = (fromCountryCode, toCountryCode, transportType = ServiceKey.VEHICLE_TRANSPORT) => ({ fromCountryCode, toCountryCode, transportType });
async function block(data) { const row = await db.routeBlock.create({ data }); ids.push(row.id); return row; }
test('default allow, directional all-type block, deactivation and same-country block', async () => {
  assert.equal(await db.routeBlock.count(), 0, 'requires empty disposable route-block table');
  for (const [from, to] of [['FR','CH'], ['CH','LB'], ['LB','LB']]) assert.equal(await policy.isBlocked(route(from,to)), false);
  const row = await block({ fromCountryCode: 'LB', toCountryCode: 'SY', reason: 'internal' });
  for (const type of Object.values(ServiceKey)) assert.equal(await policy.isBlocked(route('LB','SY',type)), true);
  assert.equal(await policy.isBlocked(route('SY','LB')), false);
  assert.equal(await policy.isBlocked(route('LB','FR')), false);
  await db.routeBlock.update({ where: { id: row.id }, data: { isActive: false } });
  assert.equal(await policy.isBlocked(route('LB','SY')), false);
  await block({ fromCountryCode: 'LB', toCountryCode: 'LB' });
  assert.equal(await policy.isBlocked(route('LB','LB')), true);
});
test('specific type, all-types precedence and reverse direction', async () => {
  await block({ fromCountryCode: 'FR', toCountryCode: 'CH', transportType: 'FURNITURE_TRANSPORT' });
  for (const type of Object.values(ServiceKey)) assert.equal(await policy.isBlocked(route('FR','CH',type)), type === 'FURNITURE_TRANSPORT');
  const all = await block({ fromCountryCode: 'FR', toCountryCode: 'CH' });
  assert.equal(await policy.isBlocked(route('FR','CH')), true);
  assert.equal(await policy.isBlocked(route('CH','FR')), false);
  await db.routeBlock.update({ where: { id: all.id }, data: { isActive: false } });
  assert.equal(await policy.isBlocked(route('FR','CH')), false);
});
test('active duplicates rejected for null and specific types; inactive history retained', async () => {
  for (const transportType of [null, ServiceKey.GOODS_TRANSPORT]) {
    const data = { fromCountryCode: 'DE', toCountryCode: 'FR', transportType };
    const results = await Promise.allSettled([block(data), block(data)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.find(r => r.status === 'rejected').reason.code, 'P2002');
    const inactive = await block({ ...data, isActive: false });
    await assert.rejects(db.routeBlock.update({ where: { id: inactive.id }, data: { isActive: true } }), e => e.code === 'P2002');
  }
});
