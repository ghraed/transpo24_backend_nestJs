// Real PostgreSQL/HTTP/socket checks. Providers are stubbed; no SMS/push/Stripe calls.
// Never point this at an existing application database.
require('reflect-metadata');
process.env.STRIPE_MODE = 'test';
process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_audit_placeholder';
if (process.env.AUDIT_DEVICE_SERVER === 'true') {
 const fs = require('node:fs'); const { parseEnv } = require('node:util');
 const env = parseEnv(fs.readFileSync('.env','utf8')); const key = env.STRIPE_TEST_SECRET_KEY || env.STRIPE_SECRET_KEY;
 if (!key?.startsWith('sk_test_')) throw Error('Staging requires Stripe test credentials.');
 process.env.STRIPE_TEST_SECRET_KEY = key; process.env.STRIPE_SECRET_KEY = key;
 process.env.STRIPE_LIVE_SECRET_KEY = ''; process.env.ENABLE_TEST_ENDPOINTS = 'false';
}

process.env.STRIPE_DIRECT_CHARGES_ENABLED = 'false';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { performance } = require('node:perf_hooks');
const { Client } = require('pg');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { io } = require('../../client_mobile/node_modules/socket.io-client');
const load = path => require(`../dist/src/${path}`);
const { AuthService } = load('auth/auth.service');
const { TERMS_VERSION, TERMS_HASH } = load('auth/legal');
const { AuthController } = load('auth/auth.controller');
const { CustomerRequestsService } = load('customer-requests/customer-requests.service');
const { CustomerRequestsController } = load('customer-requests/customer-requests.controller');
const { CustomerPlacesController } = load('customer-requests/customer-places.controller');
const { CustomerPlacesService } = load('customer-requests/customer-places.service');
const { FurnitureReservationsService } = load('customer-requests/furniture-reservations.service');
const { ChatService } = load('chat/chat.service');
const { ChatController } = load('chat/chat.controller');
const { TripsService } = load('trips/trips.service');
const { TripsGateway } = load('trips/trips.gateway');
const { PrismaService } = load('prisma/prisma.service');
const { configureHttpApplication } = load('config/http');
const { CustomerHomeController } = load('customer-requests/customer-home.controller');
const { ServicesController } = load('services/services.controller');
const { ServicesService } = load('services/services.service');
const { DriverController } = load('driver/driver.controller');
const { DriverService } = load('driver/driver.service');
const { PrivateUploadsController } = load('request-files/private-uploads.controller');
const { PrivateUploadsService } = load('request-files/private-uploads.service');
const { RequestFilesController } = load('request-files/request-files.controller');
const { RequestFilesService } = load('request-files/request-files.service');
const { PaymentsController } = load('payments/payments.controller');
const { PaymentsService } = load('payments/payments.service');
const { StripeService } = load('payments/stripe.service');
const { DelayedBookingPaymentsService } = load('payments/delayed-booking-payments.service');
const { BookingConfirmationQueueService } = load('customer-requests/booking-confirmation-queue.service');
const { NotificationsService } = load('notifications/notifications.service');
const { CustomerNotificationsController } = load('notifications/notifications.controller');


async function main() {
  const url = new URL(process.env.DATABASE_URL);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/transpo24_audit', 'Requires the dedicated disposable audit database');
  const schema = `readiness_${randomUUID().replaceAll('-', '')}`;
  const admin = new Client({ connectionString: url.toString() });
  require('node:fs').mkdirSync('uploads',{recursive:true});
  const files = mkdtempSync(join(process.cwd(),'uploads', 'audit-readiness-'));
  let prisma, app, created = false;
  const sockets = [];
  const findings = [];
  const finding = (id, detail) => { findings.push({ id, detail }); console.log(`FAIL ${id}: ${detail}`); };
  const pass = detail => console.log(`PASS: ${detail}`);
  try {
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`); created = true;
    await admin.query(`SET search_path TO "${schema}"`);
    const ddl = execFileSync('./node_modules/.bin/prisma', ['migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
    await admin.query(ddl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
    assert.equal((await prisma.$queryRawUnsafe('SELECT current_schema() AS schema'))[0].schema, schema);
    const notifications = new Proxy({}, { get: (_,key) => key === 'then' ? undefined : key === 'listCustomerNotifications' ? async()=>({items:[],unreadCount:0,nextCursor:null}) : async () => undefined });
    let activeGateway;
    const gatewayEvents = new Proxy({}, { get: (_,key) => (...args) => activeGateway?.[key]?.(...args) });
    const chat = new ChatService(prisma, notifications);
    const trips = new TripsService(prisma, notifications);
    const stripe = new StripeService();
    const delayed = new DelayedBookingPaymentsService(prisma,stripe,notifications);
    const payments = new PaymentsService(prisma,stripe,notifications,{enqueueDriverPayout:async()=>false},delayed);
    const requests = new CustomerRequestsService(prisma, payments, chat, gatewayEvents, notifications);
    const reservations = new FurnitureReservationsService(prisma,payments,notifications,{get:()=>undefined},chat);
    const bookingQueue = {skipCountdown:async(customerId,requestId)=>{await delayed.skipCountdown(customerId,requestId);await requests.finalizeAcceptedOfferPayment({customerId,requestId});}};
    const driverService = new DriverService(prisma,gatewayEvents,notifications);
    // This deterministic fake models provider code consumption, not Twilio verification.
    const codes = new Map();
    const auth = new AuthService(prisma, {
      sendCode: async phone => { assert(/^\+120255501\d{2}$/.test(phone),'Synthetic numbers only'); codes.set(phone, true); },
      verifyCode: async (phone, code) => {
        if (code !== '123456' || !codes.get(phone)) return 'invalid';
        codes.delete(phone); return 'approved';
      },
    }, { assertCanSend: async () => {}, assertCanVerify: async () => {} });
    const module = await Test.createTestingModule({
      controllers: [AuthController, CustomerRequestsController, CustomerPlacesController, ChatController, CustomerHomeController, ServicesController, DriverController, RequestFilesController, PrivateUploadsController, CustomerNotificationsController, ...(process.env.AUDIT_DEVICE_SERVER==='true'?[PaymentsController]:[])],
      providers: [TripsGateway,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
        { provide: TripsService, useValue: trips },
        { provide: ChatService, useValue: chat },
        { provide: CustomerRequestsService, useValue: requests },
        { provide: CustomerPlacesService, useValue: new CustomerPlacesService(prisma) },
        { provide: FurnitureReservationsService, useValue: reservations },
        { provide: ServicesService, useValue: new ServicesService(prisma) },
        { provide: DriverService, useValue: driverService },
        { provide: PaymentsService, useValue: payments },
        { provide: BookingConfirmationQueueService, useValue: bookingQueue },
        { provide: NotificationsService, useValue: notifications },
        { provide: RequestFilesService, useValue: new RequestFilesService(prisma) },
        { provide: PrivateUploadsService, useValue: new PrivateUploadsService(prisma) },
      ],
    }).compile();
    activeGateway = module.get(TripsGateway);
    app = module.createNestApplication({ bodyParser: false, logger: false });
    // This disposable fixture owns signals: Nest's default signal re-raise can
    // terminate the process before Stripe/schema/file cleanup completes.
    app.enableShutdownHooks = () => app;
    configureHttpApplication(app);
    await app.listen(process.env.AUDIT_DEVICE_SERVER === 'true' ? 57431 : 0, '127.0.0.1');
    const http = () => request(app.getHttpServer());
    const endpoint = await app.getUrl();
    const actor = async phone => {
      await http().post('/auth/phone/send-code').send({ phoneNumber: phone }).expect(201);
      const res = await http().post('/auth/phone/verify-code').send({ phoneNumber: phone, code: '123456', acceptedTermsVersion: TERMS_VERSION }).expect(201);
      return res.body;
    };
    let a = await actor('+12025550101');
    const b = await actor('+12025550102');
    await http().post('/auth/phone/verify-code').send({ phoneNumber: '+12025550101', code: '123456' }).expect(401);
    await http().post('/auth/phone/verify-code').send({ phoneNumber: '+12025550101', code: '12x' }).expect(400);
    pass('synthetic phone verification creates distinct persisted accounts; malformed/consumed fake codes fail');
    const refreshes = await Promise.all([1, 2].map(() => http().post('/auth/refresh').send({ refreshToken: a.refreshToken })));
    assert.deepEqual(refreshes.map(r => r.status).sort(), [201, 401]);
    const rotated = refreshes.find(r => r.status === 201).body;
    assert.equal(await prisma.refreshSession.count({ where: { userId: a.user.id, revokedAt: null } }), 1);
    await http().post('/auth/logout').send({ refreshToken: rotated.refreshToken }).expect(201);
    await http().post('/auth/refresh').send({ refreshToken: rotated.refreshToken }).expect(401);
    assert.equal(await auth.isUserActive(auth.getUserFromAccessToken(a.accessToken)), false);
    assert.equal(await auth.isUserActive(auth.getUserFromAccessToken(rotated.accessToken)), false);
    a = await actor('+12025550101');
    const secondDevice = await actor('+12025550101');
    for (let n=0;n<6;n++) {
      const chain = await actor('+12025550101');
      const [rotation] = await Promise.all([http().post('/auth/refresh').send({refreshToken:chain.refreshToken}),http().post('/auth/logout').send({refreshToken:chain.refreshToken})]);
      assert.equal(await auth.isUserActive(auth.getUserFromAccessToken(chain.accessToken)),false);
      if (rotation.status===201) {
        assert.equal(await auth.isUserActive(auth.getUserFromAccessToken(rotation.body.accessToken)),false);
        await http().post('/auth/refresh').send({refreshToken:rotation.body.refreshToken}).expect(401);
      } else assert.equal(rotation.status,401);
    }
    assert.equal(await auth.isUserActive(auth.getUserFromAccessToken(secondDevice.accessToken)),true);
    pass('PostgreSQL refresh rotates once; logout invalidates old/new access and refresh tokens, concurrent rotation cannot escape, second device remains active');
    const consent = await prisma.legalAcceptance.findUniqueOrThrow({where:{userId_version:{userId:a.user.id,version:TERMS_VERSION}}});
    assert.equal(consent.documentHash,TERMS_HASH); assert(consent.acceptedAt);
    await prisma.legalAcceptance.deleteMany({where:{userId:b.user.id}});
    await http().get('/customer/requests').set({Authorization:'Bearer '+b.accessToken}).expect(409);
    const legal = await http().get('/auth/legal').set({Authorization:'Bearer '+b.accessToken}).expect(200);assert.equal(legal.body.accepted,false);
    await http().post('/auth/legal').set({Authorization:'Bearer '+b.accessToken}).send({version:'outdated'}).expect(409);
    await http().post('/auth/legal').set({Authorization:'Bearer '+b.accessToken}).send({version:TERMS_VERSION,userId:a.user.id}).expect(400);
    await http().post('/auth/legal').set({Authorization:'Bearer '+b.accessToken}).send({version:TERMS_VERSION}).expect(201);
    pass('Terms evidence is user/version/hash/time-bound; missing evidence blocks business HTTP until explicit acceptance, stale version/user spoof rejected');
    const headers = token => ({ Authorization: `Bearer ${token}` });
    const services = {};
    for (const key of ['VEHICLE_TRANSPORT', 'MOTORCYCLE_TRANSPORT', 'GOODS_TRANSPORT', 'FURNITURE_TRANSPORT']) {
      services[key] = await prisma.service.create({ data: { key, nameEn: key, nameAr: key, descriptionEn: 'Synthetic', descriptionAr: 'Synthetic', icon: 'box', sortOrder: 1 } });
    }
    const pickup = { latitude: 47.55, longitude: 7.59, address: 'Synthetic pickup' };
    const delivery = { latitude: 47.38, longitude: 8.54, address: 'Synthetic delivery' };
    const scheduledDeliveryAt = new Date(Date.now() + 2 * 86400000).toISOString();
    const goods = { shipmentSize: 'S', goodsDescription: 'Synthetic boxes', approximateWeightKg: 10, numberOfPieces: 2, isFragile: true, requiresRefrigeration: false, isImmediate: true, scheduledDeliveryAt, scheduleTimeZone: 'Europe/Zurich', pickupLocation: pickup, deliveryLocation: delivery };
    const vehicle = await http().post('/customer/requests').set(headers(a.accessToken)).send({ serviceId: services.VEHICLE_TRANSPORT.id, clientDraftId: 'audit-vehicle', vehicleBrand: 'Synthetic', vehicleModel: 'Car', vehicleManufactureYear: 2025, vehicleEstimatedWeightKg: 1400, vehicleCondition: 'RUNNING', vehicleMobility: 'RUNNING' }).expect(201);
    const id = vehicle.body.id;
    await http().patch(`/customer/requests/${id}/pickup-location`).set(headers(a.accessToken)).send(pickup).expect(200);
    await http().patch(`/customer/requests/${id}/dropoff-location`).set(headers(a.accessToken)).send(delivery).expect(200);
    const vehicleRow = await requests.updateScheduleAndItemDetails({ customerId: a.user.id, requestId: id, isImmediate: true, scheduledDeliveryAt: new Date(scheduledDeliveryAt), scheduleTimeZone: 'Europe/Zurich', itemTitle: 'Synthetic car', itemType: 'VEHICLE', vehicleBrand: 'Synthetic', vehicleModel: 'Car', vehicleManufactureYear: 2025, vehicleEstimatedWeightKg: 1400, vehicleCondition: 'RUNNING', vehicleMobility: 'RUNNING', requiresLoadingHelp: false });
    assert.equal(vehicleRow.id, id);
    const bike = await http().post('/customer/requests/motorcycle-transport').set(headers(a.accessToken)).send({ motorcycleType: 'SPORT_BIKE', motorcycleCondition: 'WORKING', requiresSpecialWrapping: false, requiresDedicatedCarrier: false, isImmediate: true, scheduledDeliveryAt, pickupLocation: pickup, deliveryLocation: delivery }).expect(201);
    const boxes = await http().post('/customer/requests/goods-transport').set(headers(a.accessToken)).send(goods).expect(201);
    const image = await require('sharp')({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer();
    const imagePath = join(files, 'furniture.png'); writeFileSync(imagePath, image);
    const furniture = await requests.createFurnitureTransportRequest({ customerId: a.user.id, furnitureDescription: 'Synthetic furniture', approximateItemCount: 2, needsHelpers: false, customerCanHelpLoading: true, isImmediate: false, movingDate: new Date(Date.now() + 86400000), scheduledPickupAt: new Date(Date.now() + 86400000), scheduledDeliveryAt: new Date(scheduledDeliveryAt), scheduleTimeZone: 'Europe/Zurich', pickupLocation: pickup, deliveryLocation: delivery, files: [{ path: imagePath, originalname: 'furniture.png', mimetype: 'image/png', size: image.length }] });
    for (const requestId of [id, bike.body.id, boxes.body.id, furniture.id]) {
      await requests.submitCustomerRequest({ customerId: a.user.id, requestId, customerNote: 'Synthetic audit note' });
      const row = await prisma.transportRequest.findUniqueOrThrow({ where: { id: requestId } });
      assert.equal(row.status, 'PENDING_QUOTES'); assert.equal(row.customerNote, 'Synthetic audit note');
      await http().get(`/customer/requests/${requestId}/status`).set(headers(b.accessToken)).expect(403);
      await http().get(`/customer/requests/${requestId}/offers`).set(headers(b.accessToken)).expect(403);
      await http().get(`/customer/requests/${requestId}/status`).expect(401);
    }
    pass('all four service requests persist and submit; a second customer cannot read their status/offers');
    for (const value of [-1, 0, 1.5, 'bad']) {
      await http().post('/customer/requests/goods-transport').set(headers(a.accessToken)).send({ ...goods, numberOfPieces: value }).expect(400);
    }
    await http().post('/customer/requests/goods-transport').set(headers(a.accessToken)).send({ ...goods, pickupLocation: { ...pickup, latitude: 91 } }).expect(400);
    pass('HTTP rejects invalid piece counts and coordinates before database writes');
    const place = await http().post('/customer/places').set(headers(a.accessToken)).send({ ...pickup, label: 'Audit' }).expect(201);
    await http().delete(`/customer/places/${place.body.id}`).set(headers(b.accessToken)).expect(404);
    await http().delete(`/customer/places/${place.body.id}`).set(headers(a.accessToken)).expect(204);
    assert.equal((await prisma.transportRequest.findUniqueOrThrow({ where: { id } })).pickupAddress, pickup.address);
    pass('saved-address deletion is owner-only and preserves historical request addresses');
    const latencies = []; let errors = 0;
    const started = performance.now();
    for (let batch = 0; batch < 10; batch++) await Promise.all(Array.from({ length: 10 }, async () => {
      const start = performance.now();
      const response = await http().get(`/customer/requests/${id}/status`).set(headers(a.accessToken));
      latencies.push(performance.now() - start); if (response.status !== 200) errors++;
    }));
    latencies.sort((x, y) => x - y);
    console.log(JSON.stringify({ workload: 'request-status HTTP + real DB', requests: 100, concurrency: 10, durationMs: Math.round(performance.now() - started), p50Ms: Math.round(latencies[49]), p95Ms: Math.round(latencies[94]), p99Ms: Math.round(latencies[98]), errors }));
    assert.equal(errors, 0);
    // Driver lifecycle/socket authorization uses a real approved synthetic profile.
    const driverUser = await prisma.user.create({ data: { name: 'Synthetic driver', email: 'driver@example.invalid', passwordHash: 'not-a-login', role: 'DRIVER' } });
    const driver = await prisma.driverProfile.create({ data: { userId: driverUser.id, firstName: 'Synthetic', lastName: 'Driver', phone: '+12025550103', status: 'APPROVED', isProfileCompleted: true } });
    const offer = await prisma.driverOffer.create({ data: { requestId: id, driverId: driver.id, price: new Prisma.Decimal(100), currency: 'CHF', status: 'ACCEPTED' } });
    await prisma.transportRequest.update({ where: { id }, data: { status: 'DRIVER_GOING_TO_PICKUP', assignedDriverId: driver.id, acceptedOfferId: offer.id, paymentStatus: 'PAYMENT_HELD' } });
    await chat.ensureRoomForAcceptedOffer(prisma, { transportRequestId: id, clientId: a.user.id, driverId: driver.id, acceptedOfferId: offer.id });
    await auth.acceptTerms(driverUser.id,TERMS_VERSION);
    const driverFamily = await auth.createSessionFamily(driverUser.id);
    const token = auth.createAccessToken({ sessionFamily:driverFamily, id: driverUser.id, email: driverUser.email, name: driverUser.name, role: 'DRIVER', hasDriverProfile: true });
    const connect = token => new Promise((resolve, reject) => {
      const client = io(endpoint, { transports: ['websocket'], auth: { token }, reconnection: false, timeout: 3000 }); sockets.push(client);
      client.once('connect', () => resolve(client)); client.once('connect_error', reject);
    });
    const driverSocket = await connect(token);
    const emit = (client, event, payload) => new Promise((resolve, reject) => client.timeout(3000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result)));
    const before = await prisma.driverLocation.count();
    const invalidEvent = new Promise(resolve => driverSocket.once('exception', resolve));
    driverSocket.emit('driverLocationUpdate', { tripId: id, latitude: 999, longitude: 7 });
    const invalid = await Promise.race([invalidEvent, new Promise((_, reject) => setTimeout(() => reject(Error('Missing validation exception')), 3000))]);
    assert.equal(invalid.message, 'Invalid socket payload.');
    assert.equal(await prisma.driverLocation.count(), before);
    await emit(driverSocket, 'driverLocationUpdate', { tripId: id, latitude: pickup.latitude, longitude: pickup.longitude, measuredAt:new Date().toISOString() });
    assert.equal(await prisma.driverLocation.count(), before + 1);
    const otherSocket = await connect(b.accessToken);
    const denied = new Promise(resolve => otherSocket.once('exception', resolve));
    otherSocket.emit('joinTripRoom', { tripId: id });
    const rejection = await Promise.race([denied, new Promise((_, reject) => setTimeout(() => reject(Error('Missing authorization exception')), 3000))]);
    assert(rejection.message);
    assert.equal(await prisma.driverLocation.count(), before + 1);
    pass('real websocket rejects malformed GPS and cross-customer rooms; valid GPS is saved once');
    const disconnected = new Promise(resolve => driverSocket.once('disconnect', resolve));
    await prisma.driverProfile.update({ where: { id: driver.id }, data: { status: 'SUSPENDED' } });
    driverSocket.emit('driverLocationUpdate', { tripId: id, latitude: 47, longitude: 7, measuredAt:new Date().toISOString() });
    await Promise.race([disconnected, new Promise((_, reject) => setTimeout(() => reject(Error('Suspended socket remained connected')), 3000))]);
    assert.equal(await prisma.driverLocation.count(), before + 1);
    pass('driver suspension disconnects an existing socket before it can write another location');
    await prisma.driverProfile.update({ where: { id: driver.id }, data: { status: 'APPROVED' } });
    await prisma.paymentHold.create({ data: { customerId: a.user.id, requestId: id, acceptedOfferId: offer.id, driverId: driver.id, amount: 105, currency: 'CHF', paymentMethod: 'APP_WALLET', provider: 'APP_WALLET', status: 'PAYMENT_HELD', authorizedAt: new Date() } });
    const actorA = auth.getUserFromAccessToken(a.accessToken);
    const room = await prisma.chatRoom.findUniqueOrThrow({ where: { transportRequestId: id } });
    await http().get(`/chat/rooms/${room.id}/messages`).set(headers(b.accessToken)).expect(403);
    const customerSocket = await connect(a.accessToken);
    const operationId = 'audit-lost-ack-'+randomUUID();
    const firstMessage = await http().post(`/chat/rooms/${room.id}/messages`).set(headers(a.accessToken)).send({body:'Synthetic retry',operationId}).expect(201);
    const retriedMessage = await emit(customerSocket,'chat.message.send',{roomId:room.id,body:'Synthetic retry',operationId});
    assert.equal(firstMessage.body.id,retriedMessage.id);
    const restarted = new ChatService(prisma,notifications);
    assert.equal((await restarted.sendTextMessage({user:actorA,roomId:room.id,body:'Synthetic retry',operationId})).id,firstMessage.body.id);
    await http().post(`/chat/rooms/${room.id}/messages`).set(headers(a.accessToken)).send({body:'Changed',operationId}).expect(409);
    const separate = await chat.sendTextMessage({user:actorA,roomId:room.id,body:'Synthetic retry',operationId:randomUUID()});
    assert.notEqual(separate.id,firstMessage.body.id);
    assert.equal(await prisma.chatMessage.count({where:{chatRoomId:room.id}}),2);
    pass('lost acknowledgment HTTP→socket→restarted service returns same result, changed payload409, intentional identical new operation stays separate');
    const fixesBefore=await prisma.driverLocation.count();
    const baseTime=Date.now();
    const workload=await Promise.all(Array.from({length:10},async (_,n)=>trips.updateDriverLocation({driverId:driverUser.id,tripId:id,latitude:47+n/10000,longitude:7,measuredAt:new Date(baseTime+n).toISOString()})));
    const latest=await prisma.driverLocation.findFirst({where:{requestId:id},orderBy:{recordedAt:'desc'}});
    assert.equal(latest.measuredAt.getTime(),baseTime+9);assert(Math.abs(latest.receivedAt-latest.measuredAt)<=10000);
    const persisted=await prisma.driverLocation.count();
    await trips.updateDriverLocation({driverId:driverUser.id,tripId:id,latitude:46,longitude:7,measuredAt:new Date(baseTime).toISOString()});
    assert.equal(await prisma.driverLocation.count(),persisted);
    await assert.rejects(trips.updateDriverLocation({driverId:driverUser.id,tripId:id,latitude:46,longitude:7,measuredAt:new Date(Date.now()+60000).toISOString()}));
    await assert.rejects(trips.updateDriverLocation({driverId:driverUser.id,tripId:id,latitude:46,longitude:7,measuredAt:new Date(Date.now()-130000).toISOString()}));
    pass('ten concurrent GPS writes retain maximum measurement; replay/older fix ignored, future/stale rejected; measurement and receipt stored independently');
    const proof = { path: imagePath, originalname: 'proof.png', mimetype: 'image/png', size: image.length };
    await trips.markDriverArrivedAtPickup({ driverId: driverUser.id, tripId: id, latitude: pickup.latitude, longitude: pickup.longitude });
    await trips.pickupItem({ driverId: driverUser.id, tripId: id, latitude: pickup.latitude, longitude: pickup.longitude, proofPhotos: [proof] });
    await trips.startDelivery({ driverId: driverUser.id, tripId: id });
    await trips.deliverItem({ driverId: driverUser.id, tripId: id, latitude: delivery.latitude, longitude: delivery.longitude, proofPhotos: [proof] });
    await assert.rejects(trips.confirmCustomerDelivery(b.user.id, id));
    await Promise.all([trips.confirmCustomerDelivery(a.user.id, id), trips.confirmCustomerDelivery(a.user.id, id)]);
    assert((await prisma.transportRequest.findUniqueOrThrow({ where: { id } })).deliveryConfirmedByCustomerAt);
    assert.equal(await prisma.transportRequestProofPhoto.count({ where: { requestId: id } }), 2);
    await trips.createDriverRating({ customerId: a.user.id, tripId: id, rating: 5, comment: 'Synthetic feedback' });
    await assert.rejects(trips.createDriverRating({ customerId: a.user.id, tripId: id, rating: 5 }));
    assert.equal(await prisma.driverRating.count({ where: { tripId: id } }), 1);
    pass('real driver pickup, two proof records, delivery, owner-only duplicate confirmation and rating persist consistently (capture tested separately)');
    if(process.env.AUDIT_DEVICE_SERVER==='true') {
      await prisma.user.update({where:{id:a.user.id},data:{name:'Staging Customer',isProfileCompleted:true,countryCode:'CH'}});
      await prisma.driverAvailability.create({data:{driverId:driver.id,timezone:'Europe/Zurich',isOnline:false,serviceRadiusKm:100}});
      await prisma.driverProfile.update({where:{id:driver.id},data:{countryCode:'CH',countryCodes:['CH'],city:'Basel',cities:['Basel']}});
      const deviceTrip=await prisma.transportRequest.create({data:{customerId:a.user.id,serviceId:services.VEHICLE_TRANSPORT.id,status:'DRIVER_GOING_TO_PICKUP',pickupLatitude:pickup.latitude,pickupLongitude:pickup.longitude,pickupAddress:pickup.address,dropoffLatitude:delivery.latitude,dropoffLongitude:delivery.longitude,dropoffAddress:delivery.address,itemTitle:'Synthetic device vehicle',vehicleBrand:'Synthetic',vehicleModel:'Car',vehicleManufactureYear:2025,vehicleCondition:'RUNNING',vehicleMobility:'RUNNING',assignedDriverId:driver.id,paymentStatus:'PAYMENT_HELD',submittedAt:new Date(),scheduledDeliveryAt:new Date(scheduledDeliveryAt)}});
      const deviceOffer=await prisma.driverOffer.create({data:{requestId:deviceTrip.id,driverId:driver.id,price:100,currency:'CHF',status:'ACCEPTED'}});
      await prisma.transportRequest.update({where:{id:deviceTrip.id},data:{acceptedOfferId:deviceOffer.id}});
      await prisma.paymentHold.create({data:{customerId:a.user.id,requestId:deviceTrip.id,driverId:driver.id,acceptedOfferId:deviceOffer.id,amount:105,currency:'CHF',paymentMethod:'APP_WALLET',provider:'APP_WALLET',status:'PAYMENT_HELD',authorizedAt:new Date()}});
      await chat.ensureRoomForAcceptedOffer(prisma,{transportRequestId:deviceTrip.id,clientId:a.user.id,driverId:driver.id,acceptedOfferId:deviceOffer.id});
      await prisma.transportRequestPhoto.create({data:{requestId:deviceTrip.id,url:'/'+imagePath.slice(process.cwd().length+1),storageKey:imagePath.slice(process.cwd().length+1),mimeType:'image/png',sizeBytes:image.length,sortOrder:0}});
      require('node:fs').writeFileSync('/tmp/transpo24-remediation/device-fixtures.json',JSON.stringify({schema,customerId:a.user.id,otherCustomerId:b.user.id,driverUserId:driverUser.id,driverId:driver.id,requestId:deviceTrip.id}),{mode:0o600});
      console.log('DEVICE_SERVER_READY port57431; synthetic customer +12025550101 and +12025550102, driver +12025550103; fake code123456; Stripe TEST only; SMS/push/Maps/OCR stubbed or unavailable');
      await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
    }
    console.log(JSON.stringify({ findings }));
    if (findings.length) process.exitCode = 1;
  } finally {
    sockets.forEach(socket => socket.disconnect());
    await app?.close();
    if(process.env.AUDIT_DEVICE_SERVER==='true' && prisma) {
      const Stripe=require('stripe');const cleanup=new Stripe(process.env.STRIPE_TEST_SECRET_KEY,{timeout:15000,maxNetworkRetries:1});
      for(const user of await prisma.user.findMany({where:{stripeCustomerId:{not:null}},select:{stripeCustomerId:true}})) {
        for(const intent of (await cleanup.paymentIntents.list({customer:user.stripeCustomerId,limit:100})).data) {
          if(intent.status==='succeeded') await cleanup.refunds.create({payment_intent:intent.id});
          else if(intent.status!=='canceled') await cleanup.paymentIntents.cancel(intent.id);
        }
        await cleanup.customers.del(user.stripeCustomerId);
      }
    }
    await prisma?.$disconnect();
    if (created) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end(); rmSync(files, { recursive: true, force: true });
    console.log('Disposable readiness schema and synthetic photo directory removed.');
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
