import { DayOfWeek } from '@prisma/client';
import { DriverService } from './driver.service';

function setup(isOnline = true) {
  const findMany = jest.fn().mockResolvedValue([]);
  const findUnique = jest.fn().mockResolvedValue({
    id: 'request',
    status: 'QUOTED',
    assignedDriverId: null,
    acceptedOfferId: null,
    isImmediate: true,
    pickupLatitude: 0.01,
    pickupLongitude: 0,
    itemType: 'GOODS',
    service: { key: 'GOODS_TRANSPORT' },
  });
  const update = jest.fn().mockResolvedValue({
    id: 'alert',
    requestId: 'request',
    status: 'IGNORED',
  });
  const service = new DriverService(
    {
      transportRequest: { findMany, findUnique },
      driverAvailability: {
        findUnique: jest.fn().mockResolvedValue({
          isOnline,
          driver: { status: 'APPROVED', isProfileCompleted: true, cities: [] },
          timezone: 'UTC',
          schedule: Object.values(DayOfWeek).map((dayOfWeek) => ({
            dayOfWeek,
            isAvailable: true,
            startTime: '00:00',
            endTime: '24:00',
          })),
          cityCoverage: [],
          acceptsImmediateRequests: true,
          acceptsScheduledRequests: true,
          liveLatitude: 0,
          liveLongitude: 0,
          liveLocationAt: new Date(),
          baseLatitude: 0,
          baseLongitude: 0,
          serviceRadiusKm: 10,
        }),
      },
      driverRequestAlert: { update },
    } as never,
    {} as never,
    {} as never,
  );
  Object.assign(service, {
    ensureDriverProfile: jest.fn().mockResolvedValue({
      id: 'driver',
      status: 'APPROVED',
      isProfileCompleted: true,
    }),
    ensureDriverOnboardingForAlerts: jest.fn(),
    getApprovedDriverVehicles: jest.fn().mockResolvedValue([]),
    getApprovedDriverVehiclesTx: jest.fn().mockResolvedValue([
      {
        vehicleType: 'VAN',
        capacityKg: 1000,
        allowedCargoTypes: ['GOODS'],
        workingSchedule: [],
      },
    ]),
    hasCompatibleDriverVehicleForRequest: jest.fn().mockReturnValue(false),
    calculateDistanceKm: jest.fn().mockReturnValue(100),
    ensureDriverRequestAlert: jest
      .fn()
      .mockImplementation(({ requestId }: { requestId: string }) =>
        Promise.resolve({ id: requestId, requestId, status: 'ACCEPTED' }),
      ),
    toRequestAlertSummary: jest
      .fn()
      .mockImplementation((request: { id: string }) => ({
        requestId: request.id,
      })),
  });
  const db = (
    service as unknown as {
      prisma: { $transaction: jest.Mock; $queryRaw: jest.Mock };
    }
  ).prisma;
  db.$queryRaw = jest.fn().mockResolvedValue([]);
  db.$transaction = jest
    .fn()
    .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(db));
  return { service, findMany, update };
}

describe('unresolved driver job requests', () => {
  it.each([true, false])(
    'keeps old opened requests accessible (online: %s)',
    async (online) => {
      const { service, findMany } = setup(online);
      // More than the previous 50-request cap, including forms opened without sending.
      findMany.mockResolvedValue(
        Array.from({ length: 60 }, (_, i) => ({
          id: `request-${i}`,
          driverAlerts: [
            { driverId: 'driver', status: i % 2 ? 'SEEN' : 'ACCEPTED' },
          ],
        })),
      );
      const result = await service.getDriverRequestAlerts({ userId: 'user' });
      expect(result.alerts).toHaveLength(60);
      expect(result.alerts[59].requestId).toBe('request-59');
      const query = findMany.mock.calls[0][0];
      expect(query.take).toBeUndefined();
      expect(query.where.OR[0].status.in).toEqual(['PENDING_QUOTES', 'QUOTED']);
      expect(query.where.OR[0].assignedDriverId).toBeNull();
      expect(query.where.OR[0].acceptedOfferId).toBeNull();
      expect(query.where.offers).toBeUndefined();
      expect(query.where.OR[1].deferredPaymentState.in).toContain('PAID');
    },
  );

  it.each(['RESERVED', 'DRIVER_ASSIGNED'])(
    'keeps %s furniture visible without allowing offers',
    async (status) => {
      const { service, findMany } = setup(false);
      Object.assign(service, {
        getApprovedDriverVehicles: jest.fn().mockResolvedValue([
          {
            vehicleType: 'VAN',
            capacityKg: 1000,
            allowedCargoTypes: ['FURNITURE'],
            workingSchedule: [],
          },
        ]),
      });
      const prisma = (service as any).prisma;
      const availability = await prisma.driverAvailability.findUnique();
      availability.driver.cities = ['Zurich'];
      availability.cityCoverage = [
        { city: 'Zurich', latitude: 0, longitude: 0 },
      ];
      const row = {
        id: 'furniture',
        status,
        deferredPaymentState: status === 'RESERVED' ? 'WAITING' : 'PAID',
        assignedDriverId: 'other',
        acceptedOfferId: 'selected',
        service: { key: 'FURNITURE_TRANSPORT' },
        isImmediate: false,
        scheduledPickupAt: new Date(Date.now() + 7 * 86400000),
        pickupLatitude: 0,
        pickupLongitude: 0,
        itemType: 'FURNITURE',
        driverAlerts: [],
      };
      findMany.mockResolvedValue([row]);
      expect(
        (await service.getDriverRequestAlerts({ userId: 'user' })).alerts,
      ).toEqual([{ requestId: 'furniture', isCurrentlyEligible: false }]);
      availability.liveLocationAt = null;
      expect(
        (await service.getDriverRequestAlerts({ userId: 'user' })).alerts,
      ).toEqual([]);
    },
  );

  it('allows an eligible unselected driver to inspect pending furniture', async () => {
    const { service } = setup(false);
    const prisma = (service as any).prisma;
    const availability = await prisma.driverAvailability.findUnique();
    availability.driver.cities = ['Zurich'];
    availability.cityCoverage = [{ city: 'Zurich', latitude: 0, longitude: 0 }];
    Object.assign(service, {
      getApprovedDriverVehicles: jest.fn().mockResolvedValue([
        {
          vehicleType: 'VAN',
          capacityKg: 1000,
          allowedCargoTypes: ['FURNITURE'],
          workingSchedule: [],
        },
      ]),
      toRequestDetailsResponse: jest.fn((request) => ({
        requestId: request.id,
        requestStatus: request.status,
      })),
    });
    prisma.driverOffer = { findUnique: jest.fn().mockResolvedValue(null) };
    prisma.transportRequest.findUnique.mockResolvedValue({
      id: 'furniture',
      status: 'RESERVED',
      deferredPaymentState: 'WAITING',
      assignedDriverId: 'other',
      acceptedOfferId: 'selected',
      service: { key: 'FURNITURE_TRANSPORT' },
      isImmediate: false,
      scheduledPickupAt: new Date(Date.now() + 7 * 86400000),
      pickupLatitude: 0,
      pickupLongitude: 0,
      itemType: 'FURNITURE',
      driverAlerts: [],
    });
    expect(
      await service.getDriverRequestDetails({
        userId: 'user',
        requestId: 'furniture',
      }),
    ).toEqual({
      requestId: 'furniture',
      requestStatus: 'RESERVED',
    });
    availability.liveLocationAt = null;
    await expect(
      service.getDriverRequestDetails({
        userId: 'user',
        requestId: 'furniture',
      }),
    ).rejects.toThrow('Request not available for this driver.');
  });

  it('keeps dismissed and expired alerts visible while the request remains open', async () => {
    const { service, findMany } = setup();
    findMany.mockResolvedValue([
      { id: 'new', driverAlerts: [] },
      {
        id: 'ignored',
        driverAlerts: [{ driverId: 'driver', status: 'IGNORED' }],
      },
      {
        id: 'expired',
        driverAlerts: [{ driverId: 'driver', status: 'EXPIRED' }],
      },
    ]);
    expect(await service.getDriverRequestAlerts({ userId: 'user' })).toEqual({
      alerts: [
        { requestId: 'ignored', isCurrentlyEligible: false },
        { requestId: 'expired', isCurrentlyEligible: false },
      ],
      locationReference: 'GPS',
    });
  });

  it('can reopen the offer form after another driver quotes', async () => {
    const { service } = setup();
    await expect(
      service.acceptDriverRequestAlert({
        userId: 'user',
        requestId: 'request',
      }),
    ).resolves.toMatchObject({
      alertStatus: 'ACCEPTED',
      nextStep: 'SEND_PRICE_OFFER',
    });
  });

  it('can ignore a quoted request', async () => {
    const { service, update } = setup();
    await expect(
      service.ignoreDriverRequestAlert({
        userId: 'user',
        requestId: 'request',
      }),
    ).resolves.toMatchObject({ alertStatus: 'IGNORED' });
    expect(update).toHaveBeenCalled();
  });
});

describe('job navigation and assignment access', () => {
  it.each(['IGNORED', 'EXPIRED'])(
    'can reopen an available %s alert',
    async (status) => {
      const { service, update } = setup();
      Object.assign(service, {
        ensureDriverRequestAlert: jest
          .fn()
          .mockResolvedValue({ id: 'alert', requestId: 'request', status }),
      });
      await service.acceptDriverRequestAlert({
        userId: 'user',
        requestId: 'request',
      });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACCEPTED',
            ignoredAt: null,
          }),
        }),
      );
    },
  );

  it('rejects acceptance when edited details no longer match driver coverage', async () => {
    const { service, update } = setup();
    Object.assign(service, {
      ensureDriverRequestAlert: jest.fn().mockResolvedValue({
        id: 'alert',
        requestId: 'request',
        status: 'EXPIRED',
      }),
    });
    const db = (
      service as unknown as {
        prisma: {
          transportRequest: { findUnique: jest.Mock };
          $queryRaw: jest.Mock;
        };
      }
    ).prisma;
    db.transportRequest.findUnique.mockResolvedValue({
      id: 'request',
      status: 'PENDING_QUOTES',
      isImmediate: true,
      pickupLatitude: 45,
      pickupLongitude: 8,
      itemType: 'GOODS',
      service: { key: 'GOODS_TRANSPORT' },
    });
    await expect(
      service.acceptDriverRequestAlert({
        userId: 'user',
        requestId: 'request',
      }),
    ).rejects.toThrow('outside your coverage');
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('denies a previous viewer access after the customer books another driver', async () => {
    const { service } = setup();
    const prisma = (
      service as unknown as {
        prisma: { transportRequest: { findUnique: jest.Mock } };
      }
    ).prisma;
    prisma.transportRequest.findUnique.mockResolvedValue({
      id: 'request',
      assignedDriverId: 'other-driver',
      status: 'DRIVER_GOING_TO_PICKUP',
    });
    await expect(
      service.getDriverRequestDetails({ userId: 'user', requestId: 'request' }),
    ).rejects.toThrow('Request not available for this driver.');
  });

  it('returns all active accepted jobs independently of alert viewing or online state', async () => {
    const { service, findMany } = setup(false);
    const statuses = [
      'RESERVED',
      'ACCEPTED',
      'DRIVER_ASSIGNED',
      'DRIVER_GOING_TO_PICKUP',
      'DRIVER_ARRIVED_PICKUP',
      'ITEM_PICKED_UP',
      'PICKUP_IN_PROGRESS',
      'IN_TRANSIT',
      'DRIVER_GOING_TO_DROPOFF',
    ];
    findMany.mockResolvedValue(
      statuses.map((status) => ({
        id: status,
        status,
        acceptedOffer: { id: 'offer' },
      })),
    );
    Object.assign(service, {
      toAcceptedJobSummaryResponse: (request: {
        id: string;
        status: string;
      }) => ({ requestId: request.id, requestStatus: request.status }),
    });
    expect(
      await service.getDriverAcceptedJobs({ userId: 'user' }),
    ).toHaveLength(statuses.length);
    expect(findMany.mock.calls[0][0].where).toEqual({
      assignedDriverId: 'driver',
      status: { in: statuses },
    });
  });
});

describe('OMW route request search', () => {
  it('finds pickups farther along the selected route beyond GPS coverage and filters by route radius', async () => {
    const { service, findMany } = setup();
    Object.assign(service, {
      getApprovedDriverVehicles: jest.fn().mockResolvedValue([
        {
          vehicleType: 'VAN',
          capacityKg: 1000,
          allowedCargoTypes: ['GOODS'],
          workingSchedule: [],
        },
      ]),
    });
    const row = {
      id: 'on-route',
      status: 'PENDING_QUOTES',
      assignedDriverId: null,
      acceptedOfferId: null,
      isImmediate: true,
      pickupLatitude: 0.01,
      pickupLongitude: 1,
      itemType: 'GOODS',
      itemWeightKg: 10,
      service: { key: 'GOODS_TRANSPORT' },
      driverAlerts: [],
    };
    findMany.mockResolvedValue([
      row,
      { ...row, id: 'outside', pickupLatitude: 0.2 },
    ]);
    const route = {
      coordinates: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 2 },
      ],
      radiusKm: 5,
    };
    const matches = await service.getDriverRequestAlerts({
      userId: 'user',
      route,
    });
    expect(matches.alerts.map((value) => value.requestId)).toEqual([
      'on-route',
    ]);
    expect(
      (
        await service.getDriverRequestAlerts({
          userId: 'user',
          route: { ...route, radiusKm: 1 },
        })
      ).alerts,
    ).toEqual([]);
    expect(
      (await service.getDriverRequestAlerts({ userId: 'user' })).alerts,
    ).toEqual([]);
  });
});

describe('map request browsing', () => {
  it('returns open requests without availability or compatible vehicles and creates no alerts', async () => {
    const { service, findMany } = setup(false);
    const prisma = (service as any).prisma;
    prisma.driverAvailability.findUnique.mockResolvedValue(null);
    findMany.mockResolvedValue([
      { id: 'distant', createdAt: new Date(), driverAlerts: [] },
    ]);
    expect(
      (await service.getDriverMapRequests({ userId: 'user' })).alerts,
    ).toEqual([{ requestId: 'distant' }]);
    expect((service as any).ensureDriverRequestAlert).not.toHaveBeenCalled();
    expect((service as any).getApprovedDriverVehicles).not.toHaveBeenCalled();
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      status: { in: ['PENDING_QUOTES', 'QUOTED'] },
      assignedDriverId: null,
      acceptedOfferId: null,
    });
  });

  it('lets a driver view an open request without having received a notification', async () => {
    const { service } = setup(false);
    const prisma = (service as any).prisma;
    prisma.driverOffer = { findUnique: jest.fn().mockResolvedValue(null) };
    prisma.transportRequest.findUnique.mockResolvedValue({
      id: 'distant',
      status: 'PENDING_QUOTES',
      assignedDriverId: null,
      acceptedOfferId: null,
      driverAlerts: [],
      pickupLatitude: 45,
      pickupLongitude: 8,
    });
    Object.assign(service, {
      toRequestDetailsResponse: jest
        .fn()
        .mockReturnValue({ requestId: 'distant' }),
    });
    expect(
      await service.getDriverRequestDetails({
        userId: 'user',
        requestId: 'distant',
      }),
    ).toEqual({ requestId: 'distant' });
  });
});
