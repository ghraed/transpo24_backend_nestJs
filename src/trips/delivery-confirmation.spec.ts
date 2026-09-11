import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TripsService } from './trips.service';
import { PaymentsService } from '../payments/payments.service';

jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

describe('Customer delivery confirmation', () => {
  const tripId = 'c1234567890123456789012345';
  function setup(overrides = {}) {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      transportRequest: {
        findUnique: jest.fn().mockResolvedValue({
          customerId: 'payer',
          status: 'DELIVERED',
          deliveredAt: new Date(),
          ...overrides,
        }),
        updateMany,
      },
    };
    const service = new TripsService(
      {
        $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
      } as never,
      {} as never,
    );
    return { service, updateMany };
  }
  it('rejects confirmation by another customer', async () => {
    const { service, updateMany } = setup();
    await expect(
      service.confirmCustomerDelivery('other', tripId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('rejects confirmation before delivery', async () => {
    const { service, updateMany } = setup({
      status: 'IN_TRANSIT',
      deliveredAt: null,
    });
    await expect(
      service.confirmCustomerDelivery('payer', tripId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });
  it('records confirmation only when not already confirmed', async () => {
    const { service, updateMany } = setup();
    await expect(
      service.confirmCustomerDelivery('payer', tripId),
    ).resolves.toEqual({ confirmed: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: tripId,
        customerId: 'payer',
        deliveryConfirmedByCustomerAt: null,
      },
      data: { deliveryConfirmedByCustomerAt: expect.any(Date) },
    });
  });
  it.each(['automatic_retry', 'driver_manual_retry', 'admin_manual_retry'])(
    'blocks unconfirmed payout through %s',
    async (requestedBy) => {
      const createTransfer = jest.fn();
      const service = new PaymentsService(
        {} as never,
        { createTransfer } as never,
        {} as never,
      );
      const internal = service as unknown as {
        getDriverPayoutContext: (id: string) => Promise<unknown>;
        attemptDriverPayoutForTrip: (
          id: string,
          input: { requestedBy: string },
        ) => Promise<unknown>;
      };
      internal.getDriverPayoutContext = jest.fn().mockResolvedValue({
        tripStatus: 'DELIVERED',
        deliveryConfirmedByCustomerAt: null,
        earningStatus: 'PENDING',
        stripeTransferId: null,
      });
      await expect(
        internal.attemptDriverPayoutForTrip(tripId, { requestedBy }),
      ).resolves.toEqual({
        transferred: false,
        stripeTransferId: null,
        reason:
          'Waiting for the paying customer to confirm successful delivery.',
      });
      expect(createTransfer).not.toHaveBeenCalled();
    },
  );
  it('keeps the payout delay after customer confirmation', async () => {
    const update = jest.fn().mockResolvedValue({});
    const createTransfer = jest.fn();
    const service = new PaymentsService(
      { tripPaymentSettlement: { update } } as never,
      { createTransfer } as never,
      {} as never,
    );
    const internal = service as unknown as {
      getDriverPayoutContext: (id: string) => Promise<unknown>;
      attemptDriverPayoutForTrip: (
        id: string,
        input: { requestedBy: string },
      ) => Promise<{ reason: string }>;
    };
    const availableAt = new Date(Date.now() + 86400000);
    internal.getDriverPayoutContext = jest.fn().mockResolvedValue({
      tripId,
      settlementId: 'settlement',
      tripStatus: 'DELIVERED',
      deliveryConfirmedByCustomerAt: new Date(),
      earningStatus: 'PENDING',
      stripeTransferId: null,
      settlementStatus: 'COLLECTED',
      requiresManualReview: false,
      availableAt,
    });
    const result = await internal.attemptDriverPayoutForTrip(tripId, {
      requestedBy: 'driver_manual_retry',
    });
    expect(result.reason).toContain(availableAt.toISOString());
    expect(update).toHaveBeenCalled();
    expect(createTransfer).not.toHaveBeenCalled();
  });
});
