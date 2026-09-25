// Explicit disposable database only. No production URL fallback.
const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const {
  PrismaClient,
  DayOfWeek,
  TransportRequestStatus,
} = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { MatchingService } = require('../dist/src/matching/matching.service');
const {
  CustomerRequestsService,
} = require('../dist/src/customer-requests/customer-requests.service');
const { DriverService } = require('../dist/src/driver/driver.service');
const connectionString = process.env.TENANT_TEST_DATABASE_URL;
const url = new URL(connectionString);
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
  !url.pathname.endsWith('_test')
)
  throw new Error('Use a disposable local _test database.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const matching = new MatchingService(db);
const users = [],
  tenants = [],
  ownedTenantIds = [],
  requests = [],
  blocks = [];
let ownsService = false;
let driver, customer, service, vehicle, foreignTenant;
const events = [],
  pushes = [];
const gateway = new Proxy(
  {},
  {
    get:
      (_, name) =>
      (...args) =>
        events.push({ name, args }),
  },
);
const notifications = new Proxy(
  {},
  {
    get:
      (_, name) =>
      async (...args) =>
        pushes.push({ name, args }),
  },
);
const { TripsService } = require('../dist/src/trips/trips.service');
const { ChatService } = require('../dist/src/chat/chat.service');
const { PaymentsService } = require('../dist/src/payments/payments.service');
const trips = new TripsService(db, notifications);
const chat = new ChatService(db, notifications);
// No Stripe/network calls are permitted in this wallet-backed regression.
const stripe = new Proxy(
  {},
  {
    get: (_, name) => () => {
      throw new Error(`Unexpected Stripe call: ${String(name)}`);
    },
  },
);
const payouts = [];
const payments = new PaymentsService(db, stripe, notifications, {
  enqueueDriverPayout: async (input) => {
    payouts.push(input);
    return true;
  },
});
const customerService = new CustomerRequestsService(
  db,
  payments,
  chat,
  gateway,
  notifications,
);
const driverService = new DriverService(db, gateway, notifications);
const docs = [
  'VEHICLE_FRONT_PHOTO',
  'VEHICLE_REAR_PHOTO',
  'VEHICLE_SIDE_PHOTO',
  'VEHICLE_LICENSE_PLATE_PHOTO',
  'VEHICLE_REGISTRATION_FRONT',
  'VEHICLE_REGISTRATION_BACK',
  'VEHICLE_INSURANCE_DOCUMENT',
];
const route = { fromCountryCode: 'CH', toCountryCode: 'CH' };
async function request(extra = {}) {
  const row = await db.transportRequest.create({
    data: {
      customerId: customer.id,
      customerTenantId: customer.tenantId,
      originTenantId: foreignTenant.id,
      serviceId: service.id,
      status: 'PENDING_QUOTES',
      pickupCountryCode: 'CH',
      destinationCountryCode: 'CH',
      currency: 'CHF',
      isImmediate: true,
      pickupLatitude: 47.38,
      pickupLongitude: 8.54,
      dropoffLatitude: 47.4,
      dropoffLongitude: 8.6,
      itemTitle: 'Boxes',
      itemType: 'GOODS',
      itemWeightKg: 100,
      ...extra,
    },
    include: { service: true },
  });
  requests.push(row.id);
  return row;
}
before(async () => {
  for (const code of ['FR', 'CH']) {
    let tenant = await db.tenant.findUnique({ where: { countryCode: code } });
    if (!tenant) {
      tenant = await db.tenant.create({
        data: {
          code,
          countryCode: code,
          name: code,
          defaultCurrency: code === 'CH' ? 'CHF' : 'EUR',
          timezone: 'UTC',
        },
      });
      ownedTenantIds.push(tenant.id);
    }
    tenants.push(tenant);
  }
  foreignTenant = tenants[1];
  customer = await db.user.create({
    data: {
      name: 'Customer',
      email: `${crypto.randomUUID()}@test.invalid`,
      passwordHash: 'test',
      tenantId: foreignTenant.id,
    },
  });
  users.push(customer.id);
  const user = await db.user.create({
    data: {
      name: 'Driver',
      email: `${crypto.randomUUID()}@test.invalid`,
      passwordHash: 'test',
      role: 'DRIVER',
      tenantId: tenants[0].id,
      driverProfile: {
        create: {
          firstName: 'Border',
          lastName: 'Driver',
          countryCode: 'FR',
          phone: crypto.randomUUID(),
          status: 'APPROVED',
          isProfileCompleted: true,
          availability: {
            create: {
              timezone: 'UTC',
              isOnline: true,
              serviceRadiusKm: 30,
              baseLatitude: 47.38,
              baseLongitude: 8.54,
              schedule: {
                create: Object.values(DayOfWeek).map((dayOfWeek) => ({
                  dayOfWeek,
                  isAvailable: true,
                  startTime: '00:00',
                  endTime: '24:00',
                })),
              },
            },
          },
          operationalCountries: {
            create: {
              countryCode: 'CH',
              status: 'APPROVED',
              canPickup: true,
              canDropoff: true,
            },
          },
          routePermissions: { create: { ...route, status: 'APPROVED' } },
        },
      },
    },
    include: { driverProfile: true },
  });
  users.push(user.id);
  driver = user.driverProfile;
  vehicle = await db.driverVehicle.create({
    data: {
      driverId: driver.id,
      vehicleType: 'VAN',
      make: 'Test',
      model: 'Test',
      year: 2026,
      plateNumber: crypto.randomUUID(),
      capacityKg: 1000,
      allowedCargoTypes: ['GOODS'],
      dimensionsAreStandard: true,
      documents: {
        create: docs.map((type) => ({
          driverId: driver.id,
          type,
          url: 'test.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 1,
          status: 'APPROVED',
        })),
      },
    },
  });
  service = await db.service.findUnique({ where: { key: 'GOODS_TRANSPORT' } });
  if (!service) {
    ownsService = true;
    service = await db.service.create({
      data: {
        key: 'GOODS_TRANSPORT',
        nameEn: 'Goods',
        nameAr: 'Goods',
        descriptionEn: 'Test',
        descriptionAr: 'Test',
        icon: 'test',
        sortOrder: 1,
      },
    });
  }
});
after(async () => {
  await db.routeBlock.deleteMany({ where: { id: { in: blocks } } });
  await db.transportRequest.deleteMany({ where: { id: { in: requests } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  if (ownsService && service)
    await db.service.delete({ where: { id: service.id } });
  await db.tenant.deleteMany({ where: { id: { in: ownedTenantIds } } });
  await db.$disconnect();
});
async function offerInput(row) {
  await matching.activate(row.id, driver.id);
  await driverService.acceptDriverRequestAlert({
    userId: driver.userId,
    requestId: row.id,
  });
  const details = await driverService.getDriverRequestDetails({
    userId: driver.userId,
    requestId: row.id,
  });
  return {
    userId: driver.userId,
    requestId: row.id,
    price: 100,
    currency: 'CHF',
    requestVersion: details.requestVersion,
  };
}
async function denied(input, code) {
  const eventCount = events.length,
    pushCount = pushes.length;
  await assert.rejects(
    driverService.sendDriverPriceOffer(input),
    (error) => error.getResponse().code === code,
  );
  assert.equal(
    await db.driverOffer.count({ where: { requestId: input.requestId } }),
    0,
  );
  assert.equal(events.length, eventCount);
  assert.equal(pushes.length, pushCount);
}
test('direct offers require an active candidate and current country/route approval', async () => {
  const row = await request();
  const input = await offerInput(row);
  await db.driverRequestAlert.updateMany({
    where: { requestId: row.id },
    data: { isActive: false },
  });
  await denied(input, 'REQUEST_ACCESS_DENIED');
  await matching.activate(row.id, driver.id);
  await db.driverOperationalCountry.updateMany({
    where: { driverId: driver.id },
    data: { canPickup: false },
  });
  await denied(input, 'REQUEST_ACCESS_DENIED');
  await db.driverOperationalCountry.updateMany({
    where: { driverId: driver.id },
    data: { canPickup: true },
  });
  await db.driverRoutePermission.updateMany({
    where: { driverId: driver.id },
    data: { status: 'SUSPENDED' },
  });
  await denied(input, 'REQUEST_ACCESS_DENIED');
  await db.driverRoutePermission.updateMany({
    where: { driverId: driver.id },
    data: { status: 'APPROVED' },
  });
  await db.driverRequestAlert.deleteMany({ where: { requestId: row.id } });
  await denied(input, 'REQUEST_ACCESS_DENIED');
});
test('a block activated after alert acceptance denies a direct offer with a generic code', async () => {
  const row = await request();
  const input = await offerInput(row);
  const block = await db.routeBlock.create({
    data: { ...route, reason: 'Internal reason' },
  });
  blocks.push(block.id);
  await denied(input, 'ROUTE_BLOCKED');
  await db.routeBlock.update({
    where: { id: block.id },
    data: { isActive: false },
  });
  const result = await driverService.sendDriverPriceOffer(input);
  assert.equal(result.offer.currency, 'CHF');
});
test('request currency is authoritative for a French driver; omitted currency is derived, conflicts rejected', async () => {
  const row = await request();
  const input = await offerInput(row);
  for (const currency of ['EUR', '', 'USD'])
    await denied({ ...input, currency }, 'CURRENCY_MISMATCH');
  const result = await driverService.sendDriverPriceOffer({
    ...input,
    currency: undefined,
  });
  assert.equal(result.offer.currency, 'CHF');
  assert.ok(
    events.some(
      (e) =>
        e.name === 'emitOfferNew' &&
        e.args[0] === customer.id &&
        e.args[1].offer.id === result.offer.id,
    ),
  );
  assert.ok(
    pushes.some(
      (e) =>
        e.name === 'notifyCustomerAboutDriverOffer' &&
        e.args[0].offerId === result.offer.id,
    ),
  );
});
test('null optional currency derives the request currency; unresolved request currency fails closed', async () => {
  const row = await request();
  const input = await offerInput(row);
  await db.transportRequest.update({
    where: { id: row.id },
    data: { currency: null },
  });
  await denied(input, 'CURRENCY_MISMATCH');
  await db.transportRequest.update({
    where: { id: row.id },
    data: { currency: 'CHF' },
  });
  assert.equal(
    (await driverService.sendDriverPriceOffer({ ...input, currency: null }))
      .offer.currency,
    'CHF',
  );
});
test('price, ETA, stale version, accepted-alert and duplicate rules remain enforced', async () => {
  const row = await request();
  const input = await offerInput(row);
  for (const change of [
    { price: 0 },
    { price: 100001 },
    { estimatedPickupAt: new Date(0) },
    { estimatedDurationMinutes: 0 },
  ]) {
    await assert.rejects(
      driverService.sendDriverPriceOffer({ ...input, ...change }),
    );
    assert.equal(
      await db.driverOffer.count({ where: { requestId: row.id } }),
      0,
    );
  }
  await denied(
    { ...input, requestVersion: 'stale' },
    'REQUEST_DETAILS_CHANGED',
  );
  for (const status of ['NEW', 'IGNORED', 'EXPIRED']) {
    await db.driverRequestAlert.updateMany({
      where: { requestId: row.id },
      data: { status },
    });
    await assert.rejects(driverService.sendDriverPriceOffer(input));
  }
  await db.driverRequestAlert.updateMany({
    where: { requestId: row.id },
    data: { status: 'ACCEPTED' },
  });
  await driverService.sendDriverPriceOffer(input);
  await assert.rejects(
    driverService.sendDriverPriceOffer(input),
    /offer.*exists/i,
  );
});
for (const legacy of [false, true]) {
  test(`${legacy ? 'legacy accepted job without tenant/geography' : 'selected foreign driver'} completes lifecycle after a route block; unrelated users remain denied`, async () => {
    const row = await request();
    const input = await offerInput(row);
    const { offer } = await driverService.sendDriverPriceOffer(input);
    await db.customerWallet.upsert({
      where: { customerId: customer.id },
      create: { customerId: customer.id, currency: 'CHF', balance: 1000 },
      update: { balance: 1000 },
    });
    await assert.rejects(
      customerService.acceptDriverOffer({
        customerId: driver.userId,
        requestId: row.id,
        offerId: offer.id,
        confirm: true,
        paymentMethod: 'APP_WALLET',
      }),
    );
    await customerService.acceptDriverOffer({
      customerId: customer.id,
      requestId: row.id,
      offerId: offer.id,
      confirm: true,
      paymentMethod: 'APP_WALLET',
    });
    const selected = await customerService.finalizeAcceptedOfferPayment({
      customerId: customer.id,
      requestId: row.id,
    });
    assert.equal(selected.request.status, 'DRIVER_GOING_TO_PICKUP');
    assert.equal(selected.request.assignedDriverId, driver.id);
    if (legacy) {
      // Model an accepted pre-migration row: additive columns remain null.
      // Preserve the original assignment, payment hold, offer and currency.
      await db.transportRequest.update({
        where: { id: row.id },
        data: {
          customerTenantId: null,
          originTenantId: null,
          pickupCountryCode: null,
          destinationCountryCode: null,
        },
      });
      await db.driverRequestAlert.deleteMany({ where: { requestId: row.id } });
    }
    const block = await db.routeBlock.create({ data: route });
    blocks.push(block.id);
    await db.driverRequestAlert.updateMany({
      where: { requestId: row.id },
      data: { isActive: false },
    });
    await driverService.getDriverRequestDetails({
      userId: driver.userId,
      requestId: row.id,
    });
    const outsider = await db.user.create({
      data: {
        name: 'Other',
        email: `${crypto.randomUUID()}@test.invalid`,
        passwordHash: 'test',
        role: 'DRIVER',
        tenantId: foreignTenant.id,
        driverProfile: {
          create: {
            firstName: 'Other',
            lastName: 'Driver',
            phone: crypto.randomUUID(),
            status: 'APPROVED',
            isProfileCompleted: true,
          },
        },
      },
    });
    users.push(outsider.id);
    await assert.rejects(
      trips.validateDriverCanAccessTrip(outsider.id, row.id),
    );
    await trips.joinTripRoom({ userId: driver.userId, tripId: row.id });
    await assert.rejects(
      trips.joinTripRoom({ userId: outsider.id, tripId: row.id }),
    );
    const room = await db.chatRoom.findUnique({
      where: { transportRequestId: row.id },
    });
    await chat.sendTextMessage({
      user: { id: driver.userId, role: 'DRIVER' },
      roomId: room.id,
      body: 'On my way',
    });
    await assert.rejects(
      chat.sendTextMessage({
        user: { id: outsider.id, role: 'DRIVER' },
        roomId: room.id,
        body: 'Denied',
      }),
    );
    const position = {
      driverId: driver.userId,
      tripId: row.id,
      latitude: 47.38,
      longitude: 8.54,
    };
    await trips.updateDriverLocation(position);
    const tracking = await customerService.getCustomerRequestTracking({
      customerId: customer.id,
      requestId: row.id,
    });
    assert.equal(tracking.requestId, row.id);
    assert.equal(tracking.assignedDriverId, driver.id);
    assert.equal(tracking.latestDriverLocation.latitude, position.latitude);
    assert.equal(tracking.latestDriverLocation.longitude, position.longitude);
    await assert.rejects(
      customerService.getCustomerRequestTracking({
        customerId: outsider.id,
        requestId: row.id,
      }),
    );
    await trips.markDriverArrivedAtPickup(position);
    const file = {
      path: `${process.cwd()}/uploads/m9-test.jpg`,
      originalname: 'proof.jpg',
      mimetype: 'image/jpeg',
      size: 1,
    };
    await trips.pickupItem({ ...position, proofPhotos: [file] });
    assert.equal(
      await db.transportRequestProofPhoto.count({
        where: { requestId: row.id, type: 'PICKUP' },
      }),
      1,
    );
    const expense = await payments.createAdditionalCharge({
      driverUserId: driver.userId,
      requestId: row.id,
      amount: 10,
      currency: 'CHF',
      reason: 'Parking',
      invoiceFile: file,
    });
    assert.equal(expense.currency, 'CHF');
    await payments.approveAdditionalCharge({
      customerId: customer.id,
      requestId: row.id,
      chargeId: expense.id,
      confirmationLocale: 'en',
      confirmationText: 'Approve parking expense',
      paymentOption: 'CASH_ON_DELIVERY',
    });
    await trips.startDelivery({ driverId: driver.userId, tripId: row.id });
    const destination = { ...position, latitude: 47.4, longitude: 8.6 };
    const approach = await trips.updateDriverLocation(destination);
    assert.ok(approach.nearDelivery);
    await trips.deliverItem({ ...destination, proofPhotos: [file] });
    assert.equal(
      await db.transportRequestProofPhoto.count({
        where: { requestId: row.id, type: 'DELIVERY' },
      }),
      1,
    );
    await trips.confirmCustomerDelivery(customer.id, row.id);
    await trips.createDriverRating({
      customerId: customer.id,
      tripId: row.id,
      rating: 5,
      comment: 'Great',
    });
    const earning = await db.driverEarning.findUnique({
      where: { tripId: row.id },
    });
    assert.equal(earning.currency, 'CHF');
    assert.equal(Number(earning.netAmount), 95);
    assert.equal(Number(earning.platformFeeAmount), 15);
    assert.equal(await payments.queueDriverPayoutForTrip(row.id), true);
    assert.ok(
      payouts.some(
        (p) =>
          p.tripId === row.id &&
          p.runAt.getTime() === earning.availableAt.getTime(),
      ),
    );
    await db.driverEarning.update({
      where: { tripId: row.id },
      data: { availableAt: new Date(0) },
    });
    await driverService.getDriverEarningsSummary({ driverId: driver.userId });
    assert.equal(
      (await db.driverEarning.findUnique({ where: { tripId: row.id } })).status,
      'AVAILABLE',
    );
    const settlement = await db.tripPaymentSettlement.findUnique({
      where: { requestId: row.id },
    });
    assert.equal(settlement.driverPayoutState, 'EARNING_CREATED');
    assert.equal(
      (await db.user.findUnique({ where: { id: driver.userId } })).tenantId,
      tenants[0].id,
    );
    await db.routeBlock.update({
      where: { id: block.id },
      data: { isActive: false },
    });
  });
}

test('historical rows retain every existing status and remain owner-readable with null geography', async () => {
  for (const status of Object.values(TransportRequestStatus)) {
    const row = await request({
      status,
      customerTenantId: null,
      originTenantId: null,
      pickupCountryCode: null,
      destinationCountryCode: null,
    });
    const result = await customerService.getCustomerRequestStatus({
      customerId: customer.id,
      requestId: row.id,
    });
    assert.equal(result.status, status);
    const listing = await customerService.listCustomerRequests({
      customerId: customer.id,
    });
    assert.ok(listing.some((item) => item.id === row.id));
    await assert.rejects(
      customerService.getCustomerRequestStatus({
        customerId: driver.userId,
        requestId: row.id,
      }),
    );
    const persisted = await db.transportRequest.findUniqueOrThrow({
      where: { id: row.id },
    });
    assert.equal(persisted.status, status);
    assert.equal(persisted.currency, 'CHF');
    assert.equal(persisted.customerTenantId, null);
    assert.equal(persisted.pickupCountryCode, null);
  }
});

test('GPS crossing a border changes matching location without changing home tenant or approval', async () => {
  for (const position of [
    { latitude: 48.85, longitude: 2.35 },
    { latitude: 47.38, longitude: 8.54 },
  ]) {
    await driverService.updateMatchingLocation(driver.userId, {
      ...position,
      recordedAt: Date.now(),
    });
    assert.equal(
      (await db.user.findUnique({ where: { id: driver.userId } })).tenantId,
      tenants[0].id,
    );
    assert.equal(
      await db.driverOperationalCountry.count({
        where: { driverId: driver.id },
      }),
      1,
    );
  }
});
