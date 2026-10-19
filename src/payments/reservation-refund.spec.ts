import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('late reservation payment refunds', () => {
  function setup(provider = 'STRIPE') {
    const money = (amount: number) => new Prisma.Decimal(amount);
    const hold: any = {
      id: 'hold',
      requestId: 'request',
      customerId: 'customer',
      driverId: 'driver',
      amount: money(100),
      currency: 'CHF',
      provider,
      status: 'PAYMENT_CAPTURED',
      stripePaymentIntentId: 'pi_late',
    };
    const settlement: any = {
      id: 'settlement',
      currency: 'CHF',
      collectedAmount: money(100),
      refundedAmount: money(0),
      driverShareAmount: money(0),
      retainedAmount: money(0),
      updatedAt: new Date(),
    };
    const row: any = {
      id: 'request',
      customerId: 'customer',
      status: 'CANCELLED',
      deferredPaymentState: 'EXPIRED',
      paymentHold: hold,
      paymentSettlement: settlement,
      itemPickedUpAt: null,
      assignedDriverId: null,
      acceptedOfferId: 'offer',
    };
    const wallet = { id: 'wallet', balance: money(10) };
    const tx: any = {
      $queryRaw: jest.fn(async () => []),
      transportRequest: {
        findUnique: jest.fn(async () => row),
        findUniqueOrThrow: jest.fn(async () => row),
        update: jest.fn(async ({ data }: any) => Object.assign(row, data)),
      },
      paymentHold: {
        findUnique: jest.fn(async () => hold),
        update: jest.fn(async ({ data }: any) => Object.assign(hold, data)),
      },
      tripPaymentSettlement: {
        upsert: jest.fn(),
        update: jest.fn(async ({ data }: any) =>
          Object.assign(settlement, data),
        ),
      },
      customerWallet: {
        update: jest.fn(async ({ data }: any) => Object.assign(wallet, data)),
      },
      customerWalletTransaction: { create: jest.fn() },
      driverEarning: { upsert: jest.fn() },
    };
    let tail = Promise.resolve();
    const prisma: any = {
      ...tx,
      $transaction: (fn: any) => {
        const result = tail.then(() => fn(tx));
        tail = result.catch(() => undefined);
        return result;
      },
    };
    const stripe: any = {
      createRefund: jest.fn(async () => ({ id: 'refund' })),
    };
    const notifications = {
      notifyCustomerTripUpdate: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PaymentsService(
      prisma as never,
      stripe as never,
      notifications as never,
    );
    jest
      .spyOn(service, 'queueDriverPayoutForTrip')
      .mockResolvedValue(undefined as never);
    (service as any).ensureWallet = jest.fn(async () => wallet);
    return { service, stripe, tx, hold, row, settlement, wallet };
  }
  it.each([
    [5 * 60 * 1000, 100, 0, 'PAYMENT_REFUNDED'],
    [11 * 60 * 1000, 85, 15, 'PAYMENT_PARTIALLY_REFUNDED'],
    [24 * 60 * 60 * 1000 + 1, 50, 50, 'PAYMENT_PARTIALLY_REFUNDED'],
  ])(
    'refunds a paid booking cancelled after %i ms',
    async (elapsed, refund, retained, status) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-19T12:00:00Z'));
      try {
        const { service, row, hold, stripe, tx } = setup();
        row.status = 'DRIVER_ASSIGNED';
        hold.capturedAt = new Date(Date.now() - elapsed);
        const result = await (service as any).cancelCollectedTripTx(
          tx,
          'request',
          'customer',
        );
        expect(result.refundedAmount).toBe(refund);
        expect(result.retainedAmount).toBe(retained);
        expect(hold.status).toBe(status);
        expect(stripe.createRefund).toHaveBeenCalledWith(
          expect.objectContaining({ amount: refund * 100 }),
        );
      } finally {
        jest.useRealTimers();
      }
    },
  );

  describe.each(['STRIPE', 'APP_WALLET'])(
    '%s paid booking cancellation',
    (provider) => {
      beforeEach(() =>
        jest.useFakeTimers().setSystemTime(new Date('2026-10-19T12:00:00Z')),
      );
      afterEach(() => jest.useRealTimers());

      function paidBooking(elapsed: number) {
        const fixture = setup(provider);
        fixture.row.status = 'DRIVER_ASSIGNED';
        fixture.row.assignedDriverId = 'driver';
        fixture.hold.capturedAt = new Date(Date.now() - elapsed);
        // Submission and offer acceptance must not start the cancellation clock.
        fixture.row.submittedAt = new Date(Date.now() - 7 * 86400000);
        fixture.row.acceptedAt = new Date(Date.now() - 2 * 86400000);
        fixture.settlement.collectedAmount = new Prisma.Decimal('100.10');
        fixture.hold.amount = new Prisma.Decimal('100.10');
        return fixture;
      }

      it.each([
        [0, 100.1, 0],
        [599999, 100.1, 0],
        [600000, 100.1, 0],
        [600001, 85.09, 15.01],
        [86399999, 85.09, 15.01],
        [86400000, 85.09, 15.01],
        [86400001, 50.05, 50.05],
      ])(
        'uses payment time and rounds correctly at %i ms',
        async (elapsed, refund, fee) => {
          const { service, stripe, tx, hold, row, settlement, wallet } =
            paidBooking(elapsed);
          const result = await service.cancelCollectedTrip({
            requestId: 'request',
            customerId: 'customer',
          });
          expect(result).toEqual({
            requestStatus: 'CANCELLED',
            currency: 'CHF',
            refundedAmount: refund,
            retainedAmount: fee,
          });
          expect(row.status).toBe('CANCELLED');
          expect(hold.status).toBe(
            fee === 0 ? 'PAYMENT_REFUNDED' : 'PAYMENT_PARTIALLY_REFUNDED',
          );
          expect(settlement.status).toBe(
            fee === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          );
          expect(
            settlement.refundedAmount.add(settlement.retainedAmount).toString(),
          ).toBe('100.1');
          expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
          if (provider === 'STRIPE') {
            expect(stripe.createRefund).toHaveBeenCalledTimes(1);
            expect(stripe.createRefund).toHaveBeenCalledWith(
              expect.objectContaining({ amount: Math.round(refund * 100) }),
            );
            expect(tx.customerWallet.update).not.toHaveBeenCalled();
          } else {
            expect(stripe.createRefund).not.toHaveBeenCalled();
            expect(wallet.balance.toString()).toBe(
              new Prisma.Decimal(10).add(refund).toString(),
            );
            expect(tx.customerWalletTransaction.create).toHaveBeenCalledTimes(
              1,
            );
          }
          if (fee === 0) {
            expect(tx.driverEarning.upsert).not.toHaveBeenCalled();
            expect(service.queueDriverPayoutForTrip).not.toHaveBeenCalled();
            expect(settlement.driverShareAmount.toString()).toBe('0');
          } else {
            const driverShare = new Prisma.Decimal(fee)
              .mul(0.5)
              .toDecimalPlaces(2);
            expect(settlement.driverShareAmount.toString()).toBe(
              driverShare.toString(),
            );
            expect(
              settlement.driverShareAmount
                .add(settlement.platformShareAmount)
                .toString(),
            ).toBe(new Prisma.Decimal(fee).toString());
            expect(tx.driverEarning.upsert).toHaveBeenCalledTimes(1);
            expect(service.queueDriverPayoutForTrip).toHaveBeenCalledWith(
              'request',
            );
          }
        },
      );

      it('does not issue a second refund when cancellation is retried after a fee boundary', async () => {
        const { service, stripe, tx, wallet } = paidBooking(599999);
        const first = await service.cancelCollectedTrip({
          requestId: 'request',
          customerId: 'customer',
        });
        jest.advanceTimersByTime(2 * 86400000);
        const retry = await service.cancelCollectedTrip({
          requestId: 'request',
          customerId: 'customer',
        });
        expect(retry).toEqual(first);
        expect(first.refundedAmount).toBe(100.1);
        expect(stripe.createRefund).toHaveBeenCalledTimes(
          provider === 'STRIPE' ? 1 : 0,
        );
        expect(tx.customerWalletTransaction.create).toHaveBeenCalledTimes(
          provider === 'APP_WALLET' ? 1 : 0,
        );
        if (provider === 'APP_WALLET')
          expect(wallet.balance.toString()).toBe('110.1');
      });

      it('rejects cancellation by a different customer without moving money', async () => {
        const { service, stripe, tx } = paidBooking(600001);
        await expect(
          service.cancelCollectedTrip({
            requestId: 'request',
            customerId: 'other',
          }),
        ).rejects.toThrow('not allowed');
        expect(tx.$queryRaw).not.toHaveBeenCalled();
        expect(stripe.createRefund).not.toHaveBeenCalled();
        expect(tx.customerWalletTransaction.create).not.toHaveBeenCalled();
      });
    },
  );

  it('does not mark a trip cancelled when the card refund fails', async () => {
    const { service, stripe, row, hold, tx } = setup();
    row.status = 'DRIVER_ASSIGNED';
    hold.capturedAt = new Date();
    stripe.createRefund.mockRejectedValueOnce(new Error('Stripe unavailable'));
    await expect(
      service.cancelCollectedTrip({
        requestId: 'request',
        customerId: 'customer',
      }),
    ).rejects.toThrow('Stripe unavailable');
    expect(row.status).toBe('DRIVER_ASSIGNED');
    expect(hold.status).toBe('PAYMENT_CAPTURED');
    expect(tx.tripPaymentSettlement.update).not.toHaveBeenCalled();
    expect(tx.transportRequest.update).not.toHaveBeenCalled();
  });

  it('refunds the full card amount without a cancellation fee or driver earnings', async () => {
    const { service, stripe, settlement, row, hold } = setup();
    const result = await service.refundUnpaidReservation({
      customerId: 'customer',
      requestId: 'request',
    });
    expect(result.refundedAmount).toBe(100);
    expect(result.retainedAmount).toBe(0);
    expect(stripe.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10000,
        idempotencyKey: 'reservation_full_refund_request',
      }),
    );
    expect(settlement.driverShareAmount.toString()).toBe('0');
    expect(settlement.status).toBe('REFUNDED');
    expect(hold.status).toBe('PAYMENT_REFUNDED');
    expect(row.status).toBe('CANCELLED');
    await service.refundUnpaidReservation({
      customerId: 'customer',
      requestId: 'request',
    });
    expect(stripe.createRefund).toHaveBeenCalledTimes(1);
  });
  it('refunds wallet collection exactly once during concurrent retries', async () => {
    const { service, stripe, wallet, tx } = setup('APP_WALLET');
    await Promise.all([
      service.refundUnpaidReservation({
        customerId: 'customer',
        requestId: 'request',
      }),
      service.refundUnpaidReservation({
        customerId: 'customer',
        requestId: 'request',
      }),
    ]);
    expect(wallet.balance.toString()).toBe('110');
    expect(tx.customerWalletTransaction.create).toHaveBeenCalledTimes(1);
    expect(stripe.createRefund).not.toHaveBeenCalled();
  });
  it('rejects full-refund access for paid reservations and other customers', async () => {
    const { service, row, stripe } = setup();
    await expect(
      service.refundUnpaidReservation({
        customerId: 'other',
        requestId: 'request',
      }),
    ).rejects.toThrow('Only cancelled unpaid');
    row.deferredPaymentState = 'PAID';
    await expect(
      service.refundUnpaidReservation({
        customerId: 'customer',
        requestId: 'request',
      }),
    ).rejects.toThrow('Only cancelled unpaid');
    expect(stripe.createRefund).not.toHaveBeenCalled();
  });
  it('starts the payment clock on successful capture and preserves it on duplicate webhooks', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-19T12:00:00Z'));
    try {
      const { service, hold, tx } = setup();
      hold.status = 'PAYMENT_HOLD_PENDING';
      hold.capturedAt = null;
      hold.createdAt = new Date(Date.now() - 2 * 86400000);
      const paymentIntent = {
        id: 'pi_late',
        amount: 10000,
        currency: 'chf',
        status: 'succeeded',
      };
      const paidAt = new Date();
      await (service as any).syncStripePaymentIntent(
        paymentIntent,
        'payment_intent.succeeded',
      );
      expect(hold.capturedAt).toEqual(paidAt);
      expect(hold.status).toBe('PAYMENT_CAPTURED');
      jest.advanceTimersByTime(11 * 60 * 1000);
      await (service as any).syncStripePaymentIntent(
        paymentIntent,
        'payment_intent.succeeded',
      );
      expect(hold.capturedAt).toEqual(paidAt);
      expect(tx.paymentHold.update).toHaveBeenCalledTimes(1);
      expect(tx.tripPaymentSettlement.upsert).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not revive a refunded payment from delayed Stripe events', async () => {
    const { service, hold, tx } = setup();
    hold.status = 'PAYMENT_REFUNDED';
    await (service as any).syncStripePaymentIntent(
      { id: 'pi_late', amount: 10000, currency: 'chf', status: 'succeeded' },
      'payment_intent.succeeded',
    );
    expect(tx.paymentHold.update).not.toHaveBeenCalled();
    expect(tx.transportRequest.update).not.toHaveBeenCalled();
  });
  it('rejects Stripe amount and currency mismatches before updating payment state', async () => {
    const { service, hold, tx } = setup();
    hold.status = 'PAYMENT_HOLD_PENDING';
    await expect(
      (service as any).syncStripePaymentIntent(
        { id: 'pi_late', amount: 9900, currency: 'chf', status: 'succeeded' },
        'payment_intent.succeeded',
      ),
    ).rejects.toThrow('amount or currency');
    expect(tx.paymentHold.update).not.toHaveBeenCalled();
  });
});
