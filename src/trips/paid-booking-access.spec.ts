import { UserRole } from '@prisma/client';
import { TripsService } from './trips.service';

describe('paid booking tracking socket access', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-10-19T12:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());
  function setup(elapsed: number | null, status = 'DRIVER_ASSIGNED') {
    const row = {
      id: 'request',
      customerId: 'customer',
      assignedDriverId: 'driver',
      status,
      paymentHold:
        elapsed === null
          ? null
          : { capturedAt: new Date(Date.now() - elapsed) },
    };
    const db = {
      transportRequest: { findUnique: jest.fn().mockResolvedValue(row) },
      driverProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    return { service: new TripsService(db as never, {} as never), db };
  }
  it.each([null, 0, 599999, 600000])(
    'rejects customer subscriptions at %s ms',
    async (elapsed) => {
      const { service } = setup(elapsed);
      await expect(
        service.joinTripRoom({
          tripId: 'request',
          userId: 'customer',
          role: UserRole.CUSTOMER,
        }),
      ).rejects.toThrow('first 10 minutes');
    },
  );
  it('allows customer tracking only once the paid grace period has elapsed', async () => {
    const { service } = setup(600001);
    await expect(
      service.joinTripRoom({
        tripId: 'request',
        userId: 'customer',
        role: UserRole.CUSTOMER,
      }),
    ).resolves.toBeUndefined();
  });
  it('rejects subscriptions after cancellation even if the grace period has elapsed', async () => {
    const { service } = setup(86400001, 'CANCELLED');
    await expect(
      service.joinTripRoom({
        tripId: 'request',
        userId: 'customer',
        role: UserRole.CUSTOMER,
      }),
    ).rejects.toThrow('first 10 minutes');
  });
  it('keeps tracking available to the assigned driver during the customer grace period', async () => {
    const { service, db } = setup(0);
    db.driverProfile.findUnique.mockResolvedValue({ id: 'driver' });
    await expect(
      service.joinTripRoom({
        tripId: 'request',
        userId: 'driver-user',
        role: UserRole.DRIVER,
      }),
    ).resolves.toBeUndefined();
  });
  it('rejects unrelated users after the grace period', async () => {
    const { service } = setup(600001);
    await expect(
      service.joinTripRoom({
        tripId: 'request',
        userId: 'stranger',
        role: UserRole.CUSTOMER,
      }),
    ).rejects.toThrow('not allowed');
  });
});
