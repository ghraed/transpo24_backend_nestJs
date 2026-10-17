import { DriverService } from './driver.service';
describe('starting a reserved furniture pickup', () => {
  function setup(
    status = 'RESERVED',
    deferredPaymentState = 'WAITING',
    paymentStatus: string | null = null,
  ) {
    const row = {
      id: 'request',
      status,
      deferredPaymentState,
      paymentStatus,
      assignedDriver: { userId: 'driver-user', status: 'APPROVED' },
    };
    const tx = {
      $queryRaw: jest.fn(),
      transportRequest: {
        findUnique: jest.fn(async () => row),
        update: jest.fn(async ({ data }: any) => Object.assign(row, data)),
      },
    };
    const service: DriverService = Object.create(DriverService.prototype);
    const notifications = { notifyCustomerTripUpdate: jest.fn() };
    Object.assign(service, {
      prisma: { $transaction: (fn: any) => fn(tx) },
      notificationsService: notifications,
    });
    return { service, tx, notifications };
  }
  it('blocks unpaid reservations and unrelated drivers', async () => {
    const { service, tx, notifications } = setup();
    await expect(
      service.startReservedPickup('driver-user', 'request'),
    ).rejects.toThrow('confirm pickup and pay');
    await expect(
      service.startReservedPickup('another-driver', 'request'),
    ).rejects.toThrow('not assigned');
    expect(tx.transportRequest.update).not.toHaveBeenCalled();
    expect(notifications.notifyCustomerTripUpdate).not.toHaveBeenCalled();
  });
  it('starts only a paid assignment after a driver action', async () => {
    const { service, tx, notifications } = setup(
      'DRIVER_ASSIGNED',
      'PAID',
      'PAYMENT_CAPTURED',
    );
    await expect(
      service.startReservedPickup('driver-user', 'request'),
    ).resolves.toEqual({
      requestId: 'request',
      status: 'DRIVER_GOING_TO_PICKUP',
    });
    expect(tx.transportRequest.update).toHaveBeenCalledWith({
      where: { id: 'request' },
      data: { status: 'DRIVER_GOING_TO_PICKUP' },
    });
    expect(notifications.notifyCustomerTripUpdate).toHaveBeenCalledWith(
      'request',
      'DRIVER_GOING_TO_PICKUP',
    );
  });
});
