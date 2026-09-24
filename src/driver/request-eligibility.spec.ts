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
    liveLatitude: null,
    liveLongitude: null,
    liveLocationAt: null,
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
    'falls back to base for missing, stale or future GPS (%s)',
    (liveLocationAt) => {
      const a = {
        ...availability(),
        liveLatitude: 0,
        liveLongitude: 0,
        liveLocationAt,
      };
      expect(immediateReference(a, now).source).toBe('BASE');
      expect(isEligibleRequest(request(), a, vehicles, now)).toBe(true);
    },
  );
  it('never admits a request without a valid reference or pickup', () => {
    const a = { ...availability(), baseLatitude: null, baseLongitude: null };
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
    const a = { ...availability(), baseLatitude: 0, baseLongitude: 0 };
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
  it('matches scheduled pickups against any selected city, independently of GPS and base', () => {
    const a = {
      ...availability(),
      baseLatitude: 0,
      baseLongitude: 0,
      liveLatitude: 0,
      liveLongitude: 0,
      liveLocationAt: now,
    };
    const r = {
      ...request(),
      isImmediate: false,
      scheduledPickupAt: new Date('2026-09-11T10:00:00Z'),
      pickupLatitude: 46.205,
      pickupLongitude: 6.14,
    };
    expect(isEligibleRequest(r, a, vehicles, now)).toBe(true);
    expect(coverageDistance(r, a, now)).toBeLessThan(1);
    a.driver.cities = ['Zurich'];
    expect(isEligibleRequest(r, a, vehicles, now)).toBe(false);
    a.cityCoverage = [];
    expect(isEligibleRequest(r, a, vehicles, now)).toBe(false);
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
      isEligibleRequest(request(), a, v, new Date('2026-12-10T11:00:00Z')),
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
        pickupCountryCode: 'CH',
        destinationCountryCode: 'CH',
        service: { key: 'GOODS_TRANSPORT', nameEn: 'Goods' },
        driverAlerts: [{ driverId: 'driver', isActive: true }],
        createdAt: now,
        submittedAt: now,
      };
      if (scenario === 'distant') r.pickupLatitude = 0;
      if (scenario === 'scheduled') {
        r.isImmediate = false;
        r.scheduledPickupAt = new Date('2026-09-11T10:00:00Z');
        r.pickupLatitude = 46.205;
        r.pickupLongitude = 6.14;
      }
      if (scenario === 'disabled') a.acceptsImmediateRequests = false;
      if (scenario === 'missing') {
        a.baseLatitude = null;
        a.baseLongitude = null;
      }
      if (scenario === 'offline') a.isOnline = false;
      const create = jest.fn().mockResolvedValue({
        id: 'alert',
        driverId: 'driver',
        status: 'NEW',
        createdAt: now,
      });
      const matchingDriver = {
        id: 'driver',
        userId: 'user',
        availability: a,
        vehicles,
        operationalCountries: [
          { countryCode: 'CH', canPickup: true, canDropoff: true },
        ],
        routePermissions: [{ fromCountryCode: 'CH', toCountryCode: 'CH' }],
      };
      const prisma = {
        routeBlock: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
        driverProfile: {
          findMany: jest.fn().mockResolvedValue([matchingDriver]),
        },
        driverAvailability: { findUnique: jest.fn().mockResolvedValue(a) },
        transportRequest: { findMany: jest.fn().mockResolvedValue([r]) },
        driverRequestAlert: {
          findMany: jest.fn().mockResolvedValue([]),
          create,
          upsert: create,
        },
      };
      Object.assign(prisma.driverProfile, {
        findFirst: jest.fn().mockResolvedValue(matchingDriver),
      });
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
      prisma.driverRequestAlert.findMany.mockResolvedValue(
        scenario === 'offline' ? [] : [{ requestId: r.id }],
      );
      const driver = new DriverService(
        prisma as never,
        {} as never,
        gateway as never,
      );
      Object.assign((driver as unknown as { matching: object }).matching, {
        refreshDriver: jest.fn(),
      });
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
