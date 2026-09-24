// Never target an application/production database.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const { randomUUID } = require('node:crypto');
const { PrismaClient, ServiceKey } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { RouteBlocksService } = require('../dist/src/admin/route-blocks.service');
const { RoutePolicyService } = require('../dist/src/route-policy/route-policy.service');
const connectionString = process.env.TENANT_TEST_DATABASE_URL;
const url = new URL(connectionString);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.pathname.endsWith('_test')) throw new Error('Use a disposable local _test database.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const service = new RouteBlocksService(db);
const policy = new RoutePolicyService(db);
let actor;
before(async () => {
  assert.equal(await db.routeBlock.count(), 0, 'requires empty route-block table');
  actor = await db.user.create({ data: { name: 'Admin test', nickname: 'Admin', email: `m4-${randomUUID()}@example.invalid`, passwordHash: 'not-a-login', role: 'ADMIN' } });
});
after(async () => {
  if (actor) {
    await db.routeBlockAudit.deleteMany({ where: { actorAdminId: actor.id } });
    await db.routeBlock.deleteMany({ where: { createdByAdminId: actor.id } });
    await db.user.delete({ where: { id: actor.id } });
  }
  await db.$disconnect();
});
const conflict = error => error.getStatus?.() === 409 && error.getResponse().code === 'ROUTE_BLOCK_DUPLICATE';
test('create, filters, pagination, audit actor and snapshots, soft deactivate and reactivate', async () => {
  const row = await service.create({ fromCountryCode: 'LB', toCountryCode: 'SY', reason: 'internal' }, actor.id);
  assert.equal(row.createdByAdminId, actor.id);
  const page = await service.list({ fromCountryCode: 'LB', isActive: true, page: 1, limit: 1 });
  assert.equal(page.total, 1); assert.equal(page.items[0].id, row.id);
  assert.equal((await service.get(row.id)).reason, 'internal');
  await service.update(row.id, { isActive: false, reason: null }, actor.id);
  const audit = await db.routeBlockAudit.findMany({ where: { routeBlockId: row.id }, orderBy: { createdAt: 'asc' } });
  assert.equal(audit.length, 2); assert.equal(audit[0].actorAdminId, actor.id);
  assert.equal(audit[0].before, null); assert.equal(audit[0].after.reason, 'internal');
  assert.equal(audit[1].before.isActive, true); assert.equal(audit[1].after.isActive, false);
  assert.equal(audit[1].after.reason, null);
  assert.equal(await policy.isBlocked({ fromCountryCode: 'LB', toCountryCode: 'SY', transportType: ServiceKey.VEHICLE_TRANSPORT }), false);
  await service.update(row.id, { isActive: true }, actor.id);
});
test('concurrent duplicate creates and reactivation conflict leave no false audit rows', async () => {
  for (const transportType of [null, ServiceKey.GOODS_TRANSPORT]) {
    const data = { fromCountryCode: 'DE', toCountryCode: 'FR', transportType };
    const results = await Promise.allSettled([service.create(data, actor.id), service.create(data, actor.id)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.ok(conflict(results.find(r => r.status === 'rejected').reason));
    const inactive = await service.create({ ...data, isActive: false }, actor.id);
    await assert.rejects(service.update(inactive.id, { isActive: true }, actor.id), conflict);
    assert.equal((await service.get(inactive.id)).isActive, false);
    assert.equal(await db.routeBlockAudit.count({ where: { routeBlockId: inactive.id } }), 1);
  }
});
test('all-type precedence, type-specific behavior and reverse direction use shared policy', async () => {
  const furniture = await service.create({ fromCountryCode: 'FR', toCountryCode: 'CH', transportType: ServiceKey.FURNITURE_TRANSPORT }, actor.id);
  const route = { fromCountryCode: 'FR', toCountryCode: 'CH', transportType: ServiceKey.VEHICLE_TRANSPORT };
  assert.equal(await policy.findBlock(route), null);
  assert.equal((await policy.findBlock({ ...route, transportType: ServiceKey.FURNITURE_TRANSPORT })).id, furniture.id);
  const all = await service.create({ fromCountryCode: 'FR', toCountryCode: 'CH' }, actor.id);
  assert.equal((await policy.findBlock({ ...route, transportType: ServiceKey.FURNITURE_TRANSPORT })).id, all.id);
  assert.equal(await policy.findBlock({ ...route, fromCountryCode: 'CH', toCountryCode: 'FR' }), null);
});
test('concurrent edits record the actual prior committed state', async () => {
  const row = await service.create({ fromCountryCode: 'LB', toCountryCode: 'LB', reason: 'initial' }, actor.id);
  await Promise.all([service.update(row.id, { reason: 'one' }, actor.id), service.update(row.id, { reason: 'two' }, actor.id)]);
  const audits = await db.routeBlockAudit.findMany({ where: { routeBlockId: row.id, action: 'UPDATE' } });
  const first = audits.find(a => a.before.reason === 'initial');
  const second = audits.find(a => a.before.reason === first.after.reason);
  assert.ok(second); assert.equal((await service.get(row.id)).reason, second.after.reason);
});
test('failed audit insert rolls back policy mutation', async () => {
  const row = await service.create({ fromCountryCode: 'BE', toCountryCode: 'FR' }, actor.id);
  const wrapped = {};
  wrapped.$transaction = operation => db.$transaction(tx => operation(new Proxy(tx, {
    get(target, key) { return key === 'routeBlockAudit' ? { create: async () => { throw new Error('audit unavailable'); } } : Reflect.get(target, key); },
  })));
  await assert.rejects(new RouteBlocksService(wrapped).update(row.id, { isActive: false }, actor.id), /audit unavailable/);
  assert.equal((await service.get(row.id)).isActive, true);
});
test('missing records return 404', async () => {
  await assert.rejects(service.get('missing'), e => e.getStatus() === 404);
  await assert.rejects(service.update('missing', { isActive: false }, actor.id), e => e.getStatus() === 404);
});
