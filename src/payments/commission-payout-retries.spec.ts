import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';

jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

function setup(overrides = {}) {
  const context = {
    tripId: 'trip',
    earningId: 'earning',
    settlementId: 'settlement',
    customerId: 'client',
    driverId: 'driver',
    driverUserId: 'driver-user',
    tripStatus: 'DELIVERED',
    deliveryConfirmedByCustomerAt: new Date(),
    earningStatus: 'AVAILABLE',
    settlementStatus: 'COLLECTED',
    requiresManualReview: false,
    availableAt: new Date(0),
    netAmount: new Prisma.Decimal(85),
    currency: 'USD',
    stripeChargeId: 'ch_trip',
    stripeTransferId: null,
    destinationAccountId: 'acct_driver',
    stripePayoutsEnabled: true,
    payoutAttemptCount: 0,
    ...overrides,
  };
  const prisma = {
    driverEarning: {
      update: jest.fn(async ({ data }: any) => {
        if (data.status) context.earningStatus = data.status;
        if (data.stripeTransferId)
          context.stripeTransferId = data.stripeTransferId;
      }),
    },
    tripPaymentSettlement: {
      update: jest.fn(async ({ data }: any) => {
        if (data.payoutAttemptCount)
          context.payoutAttemptCount = data.payoutAttemptCount;
      }),
      updateMany: jest.fn(),
    },
  };
  const stripe = { createTransfer: jest.fn(async () => ({ id: 'tr_driver' })) };
  const notifications = { notifyTripFundsTransferred: jest.fn() };
  const service = new PaymentsService(
    prisma as never,
    stripe as never,
    notifications as never,
  );
  jest
    .spyOn(service as any, 'getDriverPayoutContext')
    .mockImplementation(async () => context);
  jest.spyOn(service as any, 'enqueueDriverPayout').mockResolvedValue(true);
  const attempt = () =>
    (service as any).attemptDriverPayoutForTrip('trip', {
      requestedBy: 'automatic_retry',
    });
  return { context, prisma, stripe, notifications, service, attempt };
}

describe('Commission payout retries and eligibility', () => {
  it('pays the driver cancellation share after a partial refund', async () => {
    const model = setup({
      tripStatus: 'CANCELLED',
      deliveryConfirmedByCustomerAt: null,
      settlementStatus: 'PARTIALLY_REFUNDED',
      netAmount: new Prisma.Decimal('7.88'),
    });
    expect(await model.attempt()).toMatchObject({ transferred: true });
    expect(model.stripe.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 788 }),
    );
  });

  it.each([
    { settlementStatus: 'DISPUTED' },
    { requiresManualReview: true },
    { settlementStatus: 'REFUNDED', tripStatus: 'CANCELLED' },
    { settlementStatus: 'PARTIALLY_REFUNDED', tripStatus: 'DELIVERED' },
    { deliveryConfirmedByCustomerAt: null },
  ])(
    'blocks ineligible payout %j without transferring money',
    async (overrides) => {
      const model = setup(overrides);
      expect(await model.attempt()).toMatchObject({ transferred: false });
      expect(model.stripe.createTransfer).not.toHaveBeenCalled();
    },
  );

  it.each([
    { destinationAccountId: null },
    { stripePayoutsEnabled: false },
    { netAmount: new Prisma.Decimal(0) },
    { netAmount: new Prisma.Decimal(-1) },
  ])(
    'records a retry without transferring an invalid payout %j',
    async (overrides) => {
      const model = setup(overrides);
      expect(await model.attempt()).toMatchObject({ transferred: false });
      expect(model.stripe.createTransfer).not.toHaveBeenCalled();
      expect(model.prisma.tripPaymentSettlement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            driverPayoutState: 'TRANSFER_FAILED',
            payoutAttemptCount: 1,
            nextPayoutRetryAt: expect.any(Date),
          }),
        }),
      );
    },
  );

  it('uses the same $85 amount and idempotency key on retry, then skips an already paid earning', async () => {
    const model = setup();
    model.stripe.createTransfer.mockRejectedValueOnce(
      new Error('Temporary Stripe failure'),
    );
    expect(await model.attempt()).toMatchObject({ transferred: false });
    expect(await model.attempt()).toMatchObject({
      transferred: true,
      stripeTransferId: 'tr_driver',
    });
    expect(await model.attempt()).toMatchObject({
      transferred: true,
      stripeTransferId: 'tr_driver',
    });
    expect(model.stripe.createTransfer).toHaveBeenCalledTimes(2);
    for (const [input] of model.stripe.createTransfer.mock.calls as unknown as [
      { amount: number; idempotencyKey: string },
    ][]) {
      expect(input).toMatchObject({
        amount: 8500,
        idempotencyKey: 'driver_payout_earning',
      });
    }
  });

  it('preserves a successful transfer when a notification fails', async () => {
    const model = setup();
    model.notifications.notifyTripFundsTransferred.mockRejectedValueOnce(
      new Error('Notification unavailable'),
    );
    expect(await model.attempt()).toMatchObject({
      transferred: true,
      stripeTransferId: 'tr_driver',
    });
    expect(model.prisma.tripPaymentSettlement.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ driverPayoutState: 'TRANSFER_FAILED' }),
      }),
    );
    await model.attempt();
    expect(model.stripe.createTransfer).toHaveBeenCalledTimes(1);
  });
});
