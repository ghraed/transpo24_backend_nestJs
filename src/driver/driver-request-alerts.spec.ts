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
      expect(query.where.offers.none).toEqual({
        driverId: 'driver',
        status: { not: 'PENDING' },
      });
      expect(query.where.driverAlerts.none.status.in).toEqual([
        'IGNORED',
        'EXPIRED',
      ]);
      expect(query.where.driverAlerts.some).toEqual(
        online ? undefined : { driverId: 'driver' },
      );
    },
  );

  it('does not rediscover unmatched jobs or restore ignored/expired alerts', async () => {
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
      alerts: [],
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
