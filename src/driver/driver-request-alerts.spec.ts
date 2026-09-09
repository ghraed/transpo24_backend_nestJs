import { DriverService } from './driver.service';

function setup(isOnline = true) {
  const findMany = jest.fn().mockResolvedValue([]);
  const findUnique = jest
    .fn()
    .mockResolvedValue({ id: 'request', status: 'QUOTED' });
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
    ensureDriverProfile: jest.fn().mockResolvedValue({ id: 'driver' }),
    ensureDriverOnboardingForAlerts: jest.fn(),
    getApprovedDriverVehicles: jest.fn().mockResolvedValue([]),
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
      expect(query.where.status.in).toEqual(['PENDING_QUOTES', 'QUOTED']);
      expect(query.where.assignedDriverId).toBeNull();
      expect(query.where.acceptedOfferId).toBeNull();
      expect(query.where.offers).toBeUndefined();
      expect(query.where.driverAlerts).toEqual(
        online ? undefined : { some: { driverId: 'driver' } },
      );
    },
  );

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
      alerts: [{ requestId: 'ignored' }, { requestId: 'expired' }],
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
