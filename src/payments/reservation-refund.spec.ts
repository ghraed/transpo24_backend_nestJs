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
        update: jest.fn(async ({ data }: any) =>
          Object.assign(settlement, data),
        ),
      },
      customerWallet: {
        update: jest.fn(async ({ data }: any) => Object.assign(wallet, data)),
      },
      customerWalletTransaction: { create: jest.fn() },
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
    const service = new PaymentsService(
      prisma as never,
      stripe as never,
      {} as never,
    );
    (service as any).ensureWallet = jest.fn(async () => wallet);
    return { service, stripe, tx, hold, row, settlement, wallet };
  }
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
