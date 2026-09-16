// Run after npm run build and prisma migrate deploy. All test records are rolled back.
require('dotenv/config');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { CustomerPlacesService } = require('../dist/src/customer-requests/customer-places.service');

async function main() {
  const prisma = new PrismaService();
  const rollback = new Error('ROLLBACK_TEST_RECORDS');
  try {
    await prisma.$transaction(async tx => {
      const service = new CustomerPlacesService(tx);
      const users = [];
      for (let i = 0; i < 2; i += 1) {
        users.push(await tx.user.create({ data: {
          name: 'Saved places integration test', email: `places-${randomUUID()}@example.invalid`, passwordHash: 'not-a-login-hash', role: 'CUSTOMER',
        } }));
      }
      const [owner, other] = users;
      const address = { latitude: 48, longitude: 8, address: 'Test warehouse', label: 'Warehouse' };
      const saved = await service.save(owner.id, address);
      const renamed = await service.save(owner.id, { ...address, label: 'Depot' });
      assert.equal(saved.id, renamed.id);
      assert.equal((await service.list(owner.id)).saved[0].label, 'Depot');
      assert.deepEqual(await service.list(other.id), { saved: [], recent: [] });
      await assert.rejects(() => service.remove(other.id, saved.id), /not found/);
      const transportService = await tx.service.findFirstOrThrow();
      const route = { customerId: owner.id, serviceId: transportService.id,
        pickupLatitude: 48, pickupLongitude: 8, pickupAddress: 'Test warehouse',
        dropoffLatitude: 49, dropoffLongitude: 9, dropoffAddress: 'Test destination',
      };
      await tx.transportRequest.create({ data: { ...route, submittedAt: new Date(), status: 'PENDING_QUOTES' } });
      await tx.transportRequest.create({ data: { ...route, pickupAddress: 'Ignored draft', pickupLatitude: 50 } });
      assert.deepEqual((await service.list(owner.id)).recent.map(point => point.address), ['Test warehouse', 'Test destination']);
      const repeated = await service.routes(owner.id);
      assert.equal(repeated.length, 1);
      assert.equal(repeated[0].pickup.address, 'Test warehouse');
      assert.equal(repeated[0].dropoff.address, 'Test destination');
      assert.deepEqual(await service.routes(other.id), []);
      await service.remove(owner.id, saved.id);
      assert.equal((await service.list(owner.id)).saved.length, 0);
      // Physical account deletion cascades to saved places.
      await service.save(other.id, address);
      await tx.user.delete({ where: { id: other.id } });
      assert.equal(await tx.savedPlace.count({ where: { customerId: other.id } }), 0);
      throw rollback;
    }, { timeout: 15000 });
  } catch (error) {
    if (error !== rollback) throw error;
    console.log('Saved places database integration passed; all test records rolled back.');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
