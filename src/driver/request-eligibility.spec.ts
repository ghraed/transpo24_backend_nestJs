import { DayOfWeek } from '@prisma/client';
import {
  coverageDistance,
  distanceKm,
  immediateReference,
  isEligibleRequest,
  LIVE_LOCATION_MAX_AGE_MS,
  MatchingAvailability,
  MatchingRequest,
  MatchingVehicle,
  MATCHING_AVAILABILITY_SELECT,
} from './request-eligibility';
import { DriverService } from './driver.service';
import { CustomerRequestsService } from '../customer-requests/customer-requests.service';

const now = new Date('2026-09-10T10:00:00Z');
function availability(): MatchingAvailability {
  return {
    isOnline: true,
    timezone: 'Europe/Zurich',
    serviceRadiusKm: 30,
    baseLatitude: 47.3769,
    baseLongitude: 8.5417,
    liveLatitude: 47.3769,
    liveLongitude: 8.5417,
    liveLocationAt: now,
    cityCoverage: [
      { city: 'Zurich', latitude: 47.3769, longitude: 8.5417 },
      { city: 'Geneva', latitude: 46.2044, longitude: 6.1432 },
    ],
    acceptsImmediateRequests: true,
    acceptsScheduledRequests: true,
    driver: {
      cities: ['Zurich', 'Geneva'],
      status: 'APPROVED',
      isProfileCompleted: true,
    },
    schedule: Object.values(DayOfWeek).map((dayOfWeek) => ({
      dayOfWeek,
      isAvailable: true,
      startTime: '08:00',
      endTime: '18:00',
    })),
  };
}
function request(): MatchingRequest {
  return {
    status: 'PENDING_QUOTES',
    assignedDriverId: null,
    acceptedOfferId: null,
    isImmediate: true,
    scheduledPickupAt: null,
    pickupLatitude: 47.38,
    pickupLongitude: 8.54,
    service: { key: 'GOODS_TRANSPORT' },
    itemType: 'GOODS',
    itemWeightKg: 100,
    itemLengthCm: 100,
    itemWidthCm: 80,
    itemHeightCm: 80,
  };
}
const vehicles: MatchingVehicle[] = [
  {
    vehicleType: 'VAN',
    capacityKg: 1000,
    lengthCm: 300,
    widthCm: 200,
    heightCm: 200,
    dimensionsAreStandard: false,
    allowedCargoTypes: ['GOODS'],
    workingSchedule: [],
  },
];

describe('shared request eligibility', () => {
  it('uses fresh GPS instead of a distant base for immediate pickups', () => {
    const a = {
      ...availability(),
      liveLatitude: 46.2044,
      liveLongitude: 6.1432,
      liveLocationAt: now,
    };
    expect(isEligibleRequest(request(), a, vehicles, now)).toBe(false);
    expect(
      isEligibleRequest(
        { ...request(), pickupLatitude: 46.205, pickupLongitude: 6.14 },
        a,
        vehicles,
        now,
      ),
    ).toBe(true);
    expect(immediateReference(a, now).source).toBe('GPS');
  });
  it.each([
    null,
    new Date(now.getTime() - LIVE_LOCATION_MAX_AGE_MS - 1),
    new Date(now.getTime() + 1),
  ])(
    'rejects missing, stale or future GPS despite saved coverage (%s)',
    (liveLocationAt) => {
      const a = {
        ...availability(),
        liveLatitude: 0,
        liveLongitude: 0,
        liveLocationAt,
      };
      expect(immediateReference(a, now).source).toBe('NONE');
      expect(isEligibleRequest(request(), a, vehicles, now)).toBe(false);
      expect(
        isEligibleRequest(
          { ...request(), isImmediate: false, scheduledPickupAt: now },
          a,
          vehicles,
          now,
        ),
      ).toBe(false);
    },
  );
  it('never admits a request without a valid reference or pickup', () => {
    const a = { ...availability(), liveLatitude: null, liveLongitude: null };
    expect(immediateReference(a, now).source).toBe('NONE');
    expect(isEligibleRequest(request(), a, vehicles, now)).toBe(false);
    expect(
      isEligibleRequest(
        { ...request(), pickupLatitude: NaN },
        availability(),
        vehicles,
        now,
      ),
    ).toBe(false);
  });
  it('includes the exact radius boundary and excludes a pickup just beyond it without rounding', () => {
    const a = { ...availability(), liveLatitude: 0, liveLongitude: 0 };
    const r = {
      ...request(),
      pickupLatitude: ((30 / 6371) * 180) / Math.PI,
      pickupLongitude: 0,
    };
    expect(
      distanceKm(
        { latitude: 0, longitude: 0 },
        { latitude: r.pickupLatitude, longitude: 0 },
      ),
    ).toBeCloseTo(30);
    expect(isEligibleRequest(r, a, vehicles, now)).toBe(true);
    expect(
      isEligibleRequest(
        { ...r, pickupLatitude: r.pickupLatitude + 0.00001 },
        a,
        vehicles,
        now,
      ),
    ).toBe(false);
  });
  it('matches scheduled pickups only around current GPS, ignoring saved base and city pins', () => {
    const a = { ...availability(), liveLatitude: 0, liveLongitude: 0 };
    const r = {
      ...request(),
      isImmediate: false,
      scheduledPickupAt: new Date('2026-09-11T10:00:00Z'),
      pickupLatitude: 46.205,
      pickupLongitude: 6.14,
    };
    expect(isEligibleRequest(r, a, vehicles, now)).toBe(false);
    a.liveLatitude = 46.2044;
    a.liveLongitude = 6.1432;
    a.cityCoverage = [];
    a.driver.cities = [];
    a.baseLatitude = null;
    a.baseLongitude = null;
    expect(isEligibleRequest(r, a, vehicles, now)).toBe(true);
    expect(coverageDistance(r, a, now)).toBeLessThan(1);
  });
  it.each([
    { isOnline: false },
    { acceptsImmediateRequests: false },
    { serviceRadiusKm: 0 },
    { timezone: 'invalid' },
  ])('rejects unavailable driver settings %j', (changes) => {
    expect(
      isEligibleRequest(
        request(),
        { ...availability(), ...changes },
        vehicles,
        now,
      ),
    ).toBe(false);
  });
  it.each(['PENDING_REVIEW', 'SUSPENDED', 'REJECTED'] as const)(
    'rejects driver status %s',
    (status) => {
      const a = availability();
      a.driver.status = status;
      expect(isEligibleRequest(request(), a, vehicles, now)).toBe(false);
    },
  );
  it.each([
    { status: 'CANCELLED' },
    { status: 'ACCEPTED' },
    { assignedDriverId: 'other' },
    { acceptedOfferId: 'offer' },
  ])('rejects unavailable requests %j', (changes) => {
    expect(
      isEligibleRequest(
        { ...request(), ...changes },
        availability(),
        vehicles,
        now,
      ),
    ).toBe(false);
  });
  it('respects scheduled preferences and rejects missing or past pickup times', () => {
    const r = { ...request(), isImmediate: false };
    expect(isEligibleRequest(r, availability(), vehicles, now)).toBe(false);
    expect(
      isEligibleRequest(
        { ...r, scheduledPickupAt: new Date(now.getTime() - 1) },
        availability(),
        vehicles,
        now,
      ),
    ).toBe(false);
    expect(
      isEligibleRequest(
        { ...r, scheduledPickupAt: now },
        { ...availability(), acceptsScheduledRequests: false },
        vehicles,
        now,
      ),
    ).toBe(false);
  });
  it('uses the driver timezone for both driver and vehicle schedules, including DST', () => {
    const a = availability();
    a.schedule = [
      {
        dayOfWeek: 'THURSDAY',
        isAvailable: true,
        startTime: '12:00',
        endTime: '13:00',
      },
    ];
    const v = [
      {
        ...vehicles[0],
        workingSchedule: [
          {
            dayOfWeek: 'THURSDAY',
            isAvailable: true,
            timeRanges: [{ startTime: '12:00', endTime: '13:00' }],
          },
        ],
      },
    ];
    expect(isEligibleRequest(request(), a, v, now)).toBe(true); // 10 UTC = 12 Zurich
    expect(
      isEligibleRequest(request(), a, v, new Date('2026-09-10T11:00:00Z')),
    ).toBe(false);
    expect(
      isEligibleRequest(
        request(),
        { ...a, liveLocationAt: new Date('2026-12-10T11:00:00Z') },
        v,
        new Date('2026-12-10T11:00:00Z'),
      ),
    ).toBe(true); // winter UTC+1
    expect(isEligibleRequest(request(), { ...a, schedule: [] }, v, now)).toBe(
      false,
    );
  });
  it('checks vehicle type, cargo capacity and working hours', () => {
    expect(isEligibleRequest(request(), availability(), [], now)).toBe(false);
    expect(
      isEligibleRequest(
        request(),
        availability(),
        [{ ...vehicles[0], vehicleType: 'MOTORCYCLE' }],
        now,
      ),
    ).toBe(false);
    expect(
      isEligibleRequest(
        request(),
        availability(),
        [{ ...vehicles[0], capacityKg: 50 }],
        now,
      ),
    ).toBe(false);
    expect(
      isEligibleRequest(
        request(),
        availability(),
        [{ ...vehicles[0], allowedCargoTypes: ['VEHICLE'] }],
        now,
      ),
    ).toBe(false);
    expect(
      isEligibleRequest(
        request(),
        availability(),
        [
          {
            ...vehicles[0],
            workingSchedule: [
              { dayOfWeek: 'THURSDAY', isAvailable: false, timeRanges: [] },
            ],
          },
        ],
        now,
      ),
    ).toBe(false);
  });
  it('does not restrict the dropoff to the pickup coverage', () => {
    const r = { ...request(), dropoffLatitude: -33.9, dropoffLongitude: 151.2 };
    expect(isEligibleRequest(r, availability(), vehicles, now)).toBe(true);
  });
});

describe('dispatch, Jobs and map consistency', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => jest.useRealTimers());
  it.each(['nearby', 'distant', 'scheduled', 'disabled', 'missing', 'offline'])(
    'uses the same matches for %s requests',
    async (scenario) => {
      const a = availability();
      const r = {
        ...request(),
        id: 'request',
        service: { key: 'GOODS_TRANSPORT', nameEn: 'Goods' },
        driverAlerts: [],
        createdAt: now,
        submittedAt: now,
      };
      if (scenario === 'distant') r.pickupLatitude = 0;
      if (scenario === 'scheduled') {
        r.isImmediate = false;
        r.scheduledPickupAt = new Date('2026-09-11T10:00:00Z');
        r.pickupLatitude = 46.205;
        r.pickupLongitude = 6.14;
        a.liveLatitude = 46.2044;
        a.liveLongitude = 6.1432;
      }
      if (scenario === 'disabled') a.acceptsImmediateRequests = false;
      if (scenario === 'missing') {
        a.liveLatitude = null;
        a.liveLongitude = null;
      }
      if (scenario === 'offline') a.isOnline = false;
      const create = jest.fn().mockResolvedValue({
        id: 'alert',
        driverId: 'driver',
        status: 'NEW',
        createdAt: now,
      });
      const prisma = {
        driverProfile: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'driver', userId: 'user', availability: a, vehicles },
            ]),
        },
        driverAvailability: { findUnique: jest.fn().mockResolvedValue(a) },
        transportRequest: { findMany: jest.fn().mockResolvedValue([r]) },
        driverRequestAlert: {
          findMany: jest.fn().mockResolvedValue([]),
          create,
        },
      };
      const gateway = {
        getDriverConnectionCount: jest.fn().mockReturnValue(1),
        emitRequestNew: jest.fn(),
      };
      const dispatch = new CustomerRequestsService(
        prisma as never,
        {} as never,
        {} as never,
        gateway as never,
        {} as never,
      );
      Object.assign(dispatch, {
        toDriverRequestAlertSummaryPayload: () => ({ requestId: r.id }),
      });
      const result = await (
        dispatch as unknown as {
          dispatchSubmittedRequestToEligibleDrivers(
            r: unknown,
          ): Promise<{ driverNotifications: unknown[] }>;
        }
      ).dispatchSubmittedRequestToEligibleDrivers(r);
      const driver = new DriverService(
        prisma as never,
        {} as never,
        gateway as never,
      );
      Object.assign(driver, {
        ensureDriverProfile: async () => ({
          id: 'driver',
          status: 'APPROVED',
          isProfileCompleted: true,
        }),
        getApprovedDriverVehicles: async () => vehicles,
        ensureDriverRequestAlert: async () => ({ id: 'alert' }),
        toRequestAlertSummary: () => ({ requestId: r.id }),
      });
      const list = await driver.getDriverRequestAlerts({ userId: 'user' });
      const eligible = scenario === 'nearby' || scenario === 'scheduled';
      expect(list.alerts).toHaveLength(eligible ? 1 : 0);
      expect(
        list.alerts.filter((alert) => alert.isCurrentlyEligible),
      ).toHaveLength(result.driverNotifications.length);
      expect(gateway.emitRequestNew).toHaveBeenCalledTimes(eligible ? 1 : 0);
      expect(prisma.driverAvailability.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ select: MATCHING_AVAILABILITY_SELECT }),
      );
      expect(
        prisma.driverProfile.findMany.mock.calls[0][0].select.availability
          .select,
      ).toEqual(MATCHING_AVAILABILITY_SELECT);
    },
  );
});

describe('current-location request delivery regressions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterEach(() => jest.useRealTimers());

  function setup(isImmediate: boolean) {
    const zurich = { latitude: 47.3769, longitude: 8.5417 };
    const geneva = { latitude: 46.2044, longitude: 6.1432 };
    const a = availability();
    const rows = [zurich, geneva].map((point, index) => ({
      ...request(),
      id: index === 0 ? 'zurich-pickup' : 'geneva-pickup',
      service: { key: 'GOODS_TRANSPORT', nameEn: 'Goods' },
      isImmediate,
      scheduledPickupAt: isImmediate ? null : new Date('2026-09-11T10:00:00Z'),
      pickupLatitude: point.latitude,
      pickupLongitude: point.longitude,
      driverAlerts: [] as { driverId: string; status: string }[],
      createdAt: now,
      submittedAt: now,
    }));
    const candidates = [
      { id: 'driver', userId: 'user', availability: a, vehicles },
    ];
    const create = jest.fn().mockImplementation(async ({ data }) => ({
      ...data,
      id: 'alert',
      status: 'NEW',
      createdAt: new Date(),
    }));
    const prisma = {
      driverProfile: { findMany: jest.fn(async () => candidates) },
      driverAvailability: {
        findUnique: jest.fn(async () => a),
        // Model persisted GPS updates; matching and service methods run unchanged.
        updateMany: jest.fn(async ({ data }) => {
          Object.assign(a, data);
          return { count: 1 };
        }),
      },
      transportRequest: { findMany: jest.fn(async () => rows) },
      driverRequestAlert: { findMany: jest.fn(async () => []), create },
    };
    const gateway = {
      getDriverConnectionCount: jest.fn(() => 1),
      emitRequestNew: jest.fn(),
    };
    const dispatchService = new CustomerRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      gateway as never,
      {} as never,
    );
    Object.assign(dispatchService, {
      toDriverRequestAlertSummaryPayload: (r, _alert, distanceKm) => ({
        requestId: r.id,
        distanceKm,
      }),
    });
    const driver = new DriverService(
      prisma as never,
      {} as never,
      gateway as never,
    );
    Object.assign(driver, {
      ensureDriverProfile: async () => ({
        id: 'driver',
        status: 'APPROVED',
        isProfileCompleted: true,
      }),
      getApprovedDriverVehicles: async () => vehicles,
      ensureDriverRequestAlert: async () => ({ id: 'alert' }),
      toRequestAlertSummary: (r, _alert, distanceKm) => ({
        requestId: r.id,
        distanceKm,
      }),
    });
    const dispatch = (r: (typeof rows)[number]) =>
      (
        dispatchService as unknown as {
          dispatchSubmittedRequestToEligibleDrivers(r: unknown): Promise<{
            driverNotifications: {
              userId: string;
              requestId: string;
              distanceKm: number;
            }[];
          }>;
        }
      ).dispatchSubmittedRequestToEligibleDrivers(r);
    return { a, rows, candidates, driver, dispatch, gateway, create, geneva };
  }

  it.each([true, false])(
    'delivers requests near GPS only, even when another driver has a nearby base (immediate: %s)',
    async (isImmediate) => {
      const { a, rows, candidates, dispatch, gateway, create, geneva } =
        setup(isImmediate);
      // Driver 1 is in Zurich but has a Geneva base. Driver 2 is the reverse.
      Object.assign(a, {
        baseLatitude: geneva.latitude,
        baseLongitude: geneva.longitude,
      });
      candidates.push({
        id: 'driver-2',
        userId: 'user-2',
        vehicles,
        availability: {
          ...availability(),
          liveLatitude: geneva.latitude,
          liveLongitude: geneva.longitude,
        },
      });
      for (const [index, row] of rows.entries()) {
        const result = await dispatch(row);
        const expectedDriver = index === 0 ? 'driver' : 'driver-2';
        expect(result.driverNotifications).toEqual([
          {
            userId: index === 0 ? 'user' : 'user-2',
            requestId: row.id,
            serviceType: 'Goods',
            distanceKm: 0,
          },
        ]);
        expect(create).toHaveBeenLastCalledWith(
          expect.objectContaining({
            data: {
              requestId: row.id,
              driverId: expectedDriver,
              status: 'NEW',
            },
          }),
        );
        expect(gateway.emitRequestNew).toHaveBeenLastCalledWith(
          expectedDriver,
          {
            requestId: row.id,
            distanceKm: 0,
          },
        );
      }
      expect(create).toHaveBeenCalledTimes(2);
      expect(gateway.emitRequestNew).toHaveBeenCalledTimes(2);
    },
  );

  it.each([true, false])(
    'switches request delivery and current map matches when the driver moves (immediate: %s)',
    async (isImmediate) => {
      const { a, rows, driver, dispatch, gateway, geneva } = setup(isImmediate);
      const assertMatches = async (expected: string) => {
        const list = await driver.getDriverRequestAlerts({ userId: 'user' });
        expect(list.locationReference).toBe('GPS');
        expect(list.alerts).toEqual([
          expect.objectContaining({
            requestId: expected,
            isCurrentlyEligible: true,
            distanceKm: 0,
          }),
        ]);
        gateway.emitRequestNew.mockClear();
        for (const row of rows) {
          const result = await dispatch(row);
          expect(result.driverNotifications.map((n) => n.requestId)).toEqual(
            row.id === expected ? [expected] : [],
          );
        }
        expect(gateway.emitRequestNew).toHaveBeenCalledTimes(1);
        expect(gateway.emitRequestNew).toHaveBeenCalledWith('driver', {
          requestId: expected,
          distanceKm: 0,
        });
      };
      await assertMatches('zurich-pickup');
      jest.setSystemTime(new Date(now.getTime() + 30_000));
      await driver.updateMatchingLocation('user', {
        ...geneva,
        recordedAt: Date.now(),
      });
      // Saved coverage still includes both cities; only the latest GPS should win.
      expect(a.baseLatitude).toBe(47.3769);
      await assertMatches('geneva-pickup');
    },
  );

  it.each([true, false])(
    'stops delivery after GPS expiry and resumes after a new fix (immediate: %s)',
    async (isImmediate) => {
      const { rows, driver, dispatch, gateway } = setup(isImmediate);
      jest.setSystemTime(new Date(now.getTime() + LIVE_LOCATION_MAX_AGE_MS));
      expect((await dispatch(rows[0])).driverNotifications).toHaveLength(1);
      jest.setSystemTime(new Date(Date.now() + 1));
      gateway.emitRequestNew.mockClear();
      expect((await dispatch(rows[0])).driverNotifications).toEqual([]);
      expect(gateway.emitRequestNew).not.toHaveBeenCalled();
      expect(await driver.getDriverRequestAlerts({ userId: 'user' })).toEqual({
        alerts: [],
        locationReference: 'NONE',
      });
      await driver.updateMatchingLocation('user', {
        latitude: 47.3769,
        longitude: 8.5417,
        recordedAt: Date.now(),
      });
      expect((await dispatch(rows[0])).driverNotifications).toHaveLength(1);
      expect(
        (await driver.getDriverRequestAlerts({ userId: 'user' })).alerts,
      ).toEqual([
        expect.objectContaining({
          requestId: 'zurich-pickup',
          isCurrentlyEligible: true,
        }),
      ]);
    },
  );

  it.each([true, false])(
    'clearing GPS stops new delivery and removes previously received jobs from current map matches (immediate: %s)',
    async (isImmediate) => {
      const { rows, driver, dispatch, gateway, create } = setup(isImmediate);
      await dispatch(rows[0]);
      rows[0].driverAlerts.push({ driverId: 'driver', status: 'SEEN' });
      await driver.updateMatchingLocation('user', null);
      gateway.emitRequestNew.mockClear();
      create.mockClear();
      for (const row of rows)
        expect((await dispatch(row)).driverNotifications).toEqual([]);
      expect(gateway.emitRequestNew).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      // Jobs retains the history, while the map excludes isCurrentlyEligible=false.
      expect(await driver.getDriverRequestAlerts({ userId: 'user' })).toEqual({
        locationReference: 'NONE',
        alerts: [
          expect.objectContaining({
            requestId: 'zurich-pickup',
            isCurrentlyEligible: false,
            distanceKm: null,
          }),
        ],
      });
    },
  );

  it.each([true, false])(
    'works without any saved base or city coverage (immediate: %s)',
    async (isImmediate) => {
      const { a, rows, driver, dispatch } = setup(isImmediate);
      Object.assign(a, {
        baseLatitude: null,
        baseLongitude: null,
        cityCoverage: [],
      });
      a.driver.cities = [];
      expect((await dispatch(rows[0])).driverNotifications).toEqual([
        expect.objectContaining({
          userId: 'user',
          requestId: 'zurich-pickup',
          distanceKm: 0,
        }),
      ]);
      expect(
        (await driver.getDriverRequestAlerts({ userId: 'user' })).alerts,
      ).toHaveLength(1);
    },
  );

  it.each([
    [null, 8.5417],
    [47.3769, null],
    [NaN, 8.5417],
    [47.3769, Infinity],
    [91, 8.5417],
    [47.3769, -181],
  ])(
    'never delivers requests for an invalid GPS coordinate (%s, %s), despite nearby saved coverage',
    async (latitude, longitude) => {
      for (const isImmediate of [true, false]) {
        const { a, rows, dispatch, driver, gateway, create } =
          setup(isImmediate);
        Object.assign(a, { liveLatitude: latitude, liveLongitude: longitude });
        expect((await dispatch(rows[0])).driverNotifications).toEqual([]);
        expect(gateway.emitRequestNew).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(await driver.getDriverRequestAlerts({ userId: 'user' })).toEqual(
          { alerts: [], locationReference: 'NONE' },
        );
      }
    },
  );
});

it('includes offline capable drivers for furniture beyond the six-day calendar window', () => {
  const a = { ...availability(), isOnline: false };
  const r: MatchingRequest = {
    ...request(),
    service: { key: 'FURNITURE_TRANSPORT' },
    itemType: 'FURNITURE',
    isImmediate: false,
    scheduleTimeZone: 'Europe/Zurich',
    scheduledPickupAt: new Date('2026-09-16T10:00:00Z'),
  };
  const v: MatchingVehicle[] = [
    { ...vehicles[0], allowedCargoTypes: ['FURNITURE'] },
  ];
  expect(isEligibleRequest(r, a, v, now)).toBe(true);
  expect(
    isEligibleRequest(
      { ...r, scheduledPickupAt: new Date('2026-09-15T10:00:00Z') },
      a,
      v,
      now,
    ),
  ).toBe(false);
  expect(isEligibleRequest(r, a, [], now)).toBe(false);
  expect(
    isEligibleRequest(
      {
        ...r,
        status: 'RESERVED',
        assignedDriverId: 'selected',
        acceptedOfferId: 'offer',
      },
      a,
      v,
      now,
    ),
  ).toBe(false);
  expect(
    isEligibleRequest(
      {
        ...r,
        status: 'DRIVER_ASSIGNED',
        assignedDriverId: 'selected',
        acceptedOfferId: 'offer',
      },
      a,
      v,
      now,
    ),
  ).toBe(false);
});
