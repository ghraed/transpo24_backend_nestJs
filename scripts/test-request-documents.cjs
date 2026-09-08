require('dotenv/config');
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { RequestFilesController } = require(
  process.cwd() + '/dist/src/request-files/request-files.controller',
);
const { RequestFilesService } = require(
  process.cwd() + '/dist/src/request-files/request-files.service',
);
const { ChatController } = require(
  process.cwd() + '/dist/src/chat/chat.controller',
);
const { ChatService } = require(process.cwd() + '/dist/src/chat/chat.service');
const { TripsGateway } = require(
  process.cwd() + '/dist/src/trips/trips.gateway',
);
const { AuthService } = require(process.cwd() + '/dist/src/auth/auth.service');
const { PrismaService } = require(
  process.cwd() + '/dist/src/prisma/prisma.service',
);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(
    new URL(process.env.DATABASE_URL).hostname,
  )
)
  throw Error('This check requires a local database.');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const rollback = new Error('ROLLBACK_TEST_FIXTURES');
let requestId;
let app;
(async () => {
  try {
    await prisma.$transaction(
      async (tx) => {
        const customer = await tx.user.create({
          data: {
            name: 'Document test',
            email: `docs-${randomUUID()}@example.invalid`,
            passwordHash: 'not-a-login',
          },
        });
        const driverUser = await tx.user.create({
          data: {
            name: 'Document driver test',
            email: `docs-${randomUUID()}@example.invalid`,
            passwordHash: 'not-a-login',
            role: 'DRIVER',
          },
        });
        const driver = await tx.driverProfile.create({
          data: {
            userId: driverUser.id,
            firstName: 'Test',
            lastName: 'Documents',
            phone: `test-${randomUUID()}`,
          },
        });
        const service = await tx.service.upsert({
          where: { key: 'VEHICLE_TRANSPORT' },
          update: {},
          create: {
            key: 'VEHICLE_TRANSPORT',
            nameEn: 'Test',
            nameAr: 'Test',
            descriptionEn: 'Test',
            descriptionAr: 'Test',
            icon: 'car',
            sortOrder: 100,
          },
        });
        const trip = await tx.transportRequest.create({
          data: { customerId: customer.id, serviceId: service.id },
        });
        requestId = trip.id;
        const offer = await tx.driverOffer.create({
          data: {
            requestId,
            driverId: driver.id,
            price: 100,
            currency: 'EUR',
            status: 'ACCEPTED',
          },
        });
        await tx.transportRequest.update({
          where: { id: requestId },
          data: {
            acceptedOfferId: offer.id,
            assignedDriverId: driver.id,
            paymentStatus: 'PAYMENT_HOLD_PENDING',
          },
        });
        const room = await tx.chatRoom.create({
          data: {
            transportRequestId: requestId,
            clientId: customer.id,
            driverId: driver.id,
            acceptedOfferId: offer.id,
          },
        });
        // Nest endpoints use the real transaction; nested service writes stay inside it.
        const db = new Proxy(tx, {
          get: (target, key) =>
            key === '$transaction'
              ? (callback) => callback(tx)
              : Reflect.get(target, key),
        });
        const actors = {
          customer,
          driver: { ...driverUser, hasDriverProfile: true },
          admin: { id: 'test-admin', role: 'ADMIN' },
          stranger: { id: 'test-stranger', role: 'CUSTOMER' },
        };
        let realtimeEvents = 0;
        let notifications = 0;
        const module = await Test.createTestingModule({
          controllers: [RequestFilesController, ChatController],
          providers: [
            RequestFilesService,
            { provide: PrismaService, useValue: db },
            {
              provide: ChatService,
              useValue: new ChatService(db, {
                notifyChatMessage: async () => {
                  notifications++;
                },
              }),
            },
            {
              provide: TripsGateway,
              useValue: {
                emitChatMessageCreated: () => {
                  realtimeEvents++;
                },
              },
            },
            {
              provide: AuthService,
              useValue: {
                getUserFromAccessToken: (token) => actors[token],
                isUserActive: async () => true,
              },
            },
          ],
        }).compile();
        app = module.createNestApplication();
        await app.init();
        const http = () => request(app.getHttpServer());
        const path = `/request-files/request/${requestId}`;
        const before = await http()
          .get(path)
          .set('Authorization', 'Bearer customer')
          .expect(200);
        assert.equal(before.body.shouldPrompt, false);
        await http()
          .post(path)
          .set('Authorization', 'Bearer customer')
          .field('documentType', 'OTHER')
          .attach('file', Buffer.from('%PDF-1.7\nprivate'), 'test.pdf')
          .expect(403);
        await tx.transportRequest.update({
          where: { id: requestId },
          data: { paymentStatus: 'PAYMENT_HELD' },
        });
        const funded = await http()
          .get(path)
          .set('Authorization', 'Bearer customer')
          .expect(200);
        assert.equal(funded.body.shouldPrompt, true);
        const formats = [
          [
            'PICKUP_AUTHORIZATION',
            '%PDF-1.7\nprivate',
            'authorization.pdf',
            'application/pdf',
          ],
          [
            'INSURANCE',
            [255, 216, 255, 224, 0, 16],
            'insurance.jpg',
            'image/jpeg',
          ],
          [
            'PURCHASE_PROOF',
            [137, 80, 78, 71, 13, 10, 26, 10, 0],
            'proof.png',
            'image/png',
          ],
          ['OTHER', '%PDF-1.7\nother', 'other.pdf', 'application/pdf'],
        ];
        const ids = [];
        for (const [type, bytes, name, mime] of formats) {
          const body = Buffer.from(bytes);
          const uploaded = await http()
            .post(path)
            .set('Authorization', 'Bearer customer')
            .field('documentType', type)
            .attach('file', body, { filename: name, contentType: mime })
            .expect(201);
          ids.push(uploaded.body.id);
          assert.equal(uploaded.body.data, undefined);
          for (const actor of ['customer', 'driver', 'admin']) {
            const downloaded = await http()
              .get(`/request-files/${uploaded.body.id}/content`)
              .set('Authorization', `Bearer ${actor}`)
              .expect(200);
            assert.deepEqual(downloaded.body, body);
            assert.equal(
              downloaded.headers['cache-control'],
              'private, no-store',
            );
          }
        }
        const metadata = await http()
          .get(path)
          .set('Authorization', 'Bearer customer')
          .expect(200);
        assert.equal(metadata.body.files.length, 4);
        assert.equal(metadata.body.shouldPrompt, false);
        await http().get(`/request-files/${ids[0]}/content`).expect(401);
        await http()
          .get(`/request-files/${ids[0]}/content`)
          .set('Authorization', 'Bearer stranger')
          .expect(403);
        await http()
          .post(path)
          .set('Authorization', 'Bearer driver')
          .field('documentType', 'OTHER')
          .attach('file', Buffer.from('%PDF-1.7'), 'test.pdf')
          .expect(403);
        await http()
          .post(path)
          .set('Authorization', 'Bearer customer')
          .field('documentType', 'OTHER')
          .attach('file', Buffer.from('<script>no</script>'), 'test.pdf')
          .expect(400);
        await http()
          .post(path)
          .set('Authorization', 'Bearer customer')
          .field('documentType', 'OTHER')
          .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), 'too-large.pdf')
          .expect(413);
        for (const actor of ['customer', 'driver']) {
          const message = await http()
            .post(`/chat/rooms/${room.id}/attachments`)
            .set('Authorization', `Bearer ${actor}`)
            .attach('file', Buffer.from('%PDF-1.7\nchat'), 'chat.pdf')
            .expect(201);
          assert.equal(message.body.type, 'FILE');
          await http()
            .get(message.body.attachmentUrl)
            .set(
              'Authorization',
              actor === 'customer' ? 'Bearer driver' : 'Bearer customer',
            )
            .expect(200);
        }
        assert.equal(realtimeEvents, 2);
        assert.equal(notifications, 2);
        const admin = await http()
          .get(path)
          .set('Authorization', 'Bearer admin')
          .expect(200);
        assert.equal(admin.body.files.length, 4);
        assert.equal(admin.body.chatFiles.length, 2);
        await tx.transportRequest.update({
          where: { id: requestId },
          data: { assignedDriverId: null, acceptedOfferId: null },
        });
        await http()
          .get(`/request-files/${ids[0]}/content`)
          .set('Authorization', 'Bearer driver')
          .expect(403);
        await http()
          .post(`/chat/rooms/${room.id}/attachments`)
          .set('Authorization', 'Bearer driver')
          .attach('file', Buffer.from('%PDF-1.7'), 'test.pdf')
          .expect(403);
        await tx.transportRequest.delete({ where: { id: requestId } });
        assert.equal(await tx.requestFile.count({ where: { requestId } }), 0);
        throw rollback;
      },
      { timeout: 60000 },
    );
  } catch (e) {
    if (e !== rollback) throw e;
  }
  assert.equal(
    await prisma.transportRequest.count({ where: { id: requestId } }),
    0,
  );
  console.log(
    'PASS: real PostgreSQL + authenticated multipart HTTP; four official types; PDF/JPG/PNG round trips; payment gate; private downloads; invalid/oversize rejection; bidirectional chat; realtime/push; admin separation; revoked driver; cascade deletion. All fixture writes rolled back.',
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });
