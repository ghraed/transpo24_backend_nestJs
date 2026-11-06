import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';

function fixture() {
  const hold = {
    id: 'hold',
    provider: 'STRIPE',
    status: 'PAYMENT_CAPTURED',
    stripePaymentIntentId: 'pi_owned',
    stripeAccountId: 'acct_owned',
  };
  const settlement = {
    id: 'settlement',
    status: 'COLLECTED',
    collectedAmount: new Prisma.Decimal('10.50'),
    refundedAmount: new Prisma.Decimal(0),
    driverPayoutState: 'PAID_OUT',
    currency: 'CHF',
    disputeReportedAt: null,
    refundReviewedByAdminId: null as string | null,
    refundReviewReason: null as string | null,
  };
  const earning = { id: 'earning', status: 'PAID_OUT' };
  const request = {
    status: 'DELIVERED',
    deliveryConfirmedByCustomerAt: new Date(),
    paymentStatus: 'PAYMENT_CAPTURED',
    paymentHold: hold,
    paymentSettlement: settlement,
    driverEarning: earning,
  };
  const db = {
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(db),
    ),
    transportRequest: {
      findUnique: jest.fn(async () => request),
      update: jest.fn(async ({ data }: { data: object }) =>
        Object.assign(request, data),
      ),
    },
    paymentHold: {
      update: jest.fn(async ({ data }: { data: object }) =>
        Object.assign(hold, data),
      ),
    },
    tripPaymentSettlement: {
      update: jest.fn(async ({ data }: { data: object }) =>
        Object.assign(settlement, data),
      ),
    },
    additionalCharge: { count: jest.fn(async () => 0) },
    driverEarning: { update: jest.fn() },
  };
  const refunds: Array<{
    id: string;
    status: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  }> = [];
  const stripe = {
    retrievePaymentIntent: jest.fn(async () => ({
      status: 'succeeded',
      currency: 'chf',
      amount_received: 1050,
    })),
    listRefundsForPaymentIntent: jest.fn(async () => ({ data: [...refunds] })),
    createRefund: jest.fn(
      async (input: { metadata: Record<string, string> }) => {
        const refund = {
          id: 're_owned',
          status: 'succeeded',
          amount: 1050,
          currency: 'chf',
          metadata: input.metadata,
        };
        refunds.push(refund);
        return refund;
      },
    ),
  };
  const service = new PaymentsService(
    db as never,
    stripe as never,
    {} as never,
  );
  const input = {
    adminId: 'admin',
    requestId: 'trip',
    expectedAmount: 10.5,
    reason: 'Customer dispute reviewed and approved.',
  };
  return {
    service,
    input,
    db,
    stripe,
    request,
    hold,
    settlement,
    earning,
    refunds,
  };
}

describe('admin-reviewed full refund', () => {
  it('refunds a captured connected charge once and preserves paid-out history for review', async () => {
    const x = fixture();
    const first = await x.service.adminRefundCapturedTrip(x.input);
    const second = await x.service.adminRefundCapturedTrip(x.input);
    expect(first).toEqual(second);
    expect(first).toEqual(
      expect.objectContaining({
        status: 'SUCCEEDED',
        refundId: 're_owned',
        requiresManualReview: true,
      }),
    );
    expect(x.stripe.createRefund).toHaveBeenCalledTimes(1);
    expect(x.stripe.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: 'pi_owned',
        stripeAccountId: 'acct_owned',
        amount: 1050,
        idempotencyKey: 'admin_trip_full_refund_trip',
      }),
    );
    expect(x.hold.status).toBe('PAYMENT_REFUNDED');
    expect(x.settlement.status).toBe('REFUNDED');
    expect(x.settlement.refundedAmount.toString()).toBe('10.5');
    expect(x.settlement.driverPayoutState).toBe('PAID_OUT');
    expect(x.earning.status).toBe('PAID_OUT');
    expect(x.settlement.refundReviewedByAdminId).toBe('admin');
  });

  it('recovers a lost provider response from the same refund without creating another', async () => {
    const x = fixture();
    x.stripe.createRefund.mockImplementationOnce(async (input) => {
      x.refunds.push({
        id: 're_owned',
        status: 'succeeded',
        amount: 1050,
        currency: 'chf',
        metadata: input.metadata,
      });
      throw new Error('Provider response lost');
    });
    await expect(x.service.adminRefundCapturedTrip(x.input)).rejects.toThrow(
      'Provider response lost',
    );
    expect(x.settlement.status).toBe('REFUND_PENDING');
    const recovered = await x.service.adminRefundCapturedTrip(x.input);
    expect(recovered.status).toBe('SUCCEEDED');
    expect(x.stripe.createRefund).toHaveBeenCalledTimes(1);
  });

  it('rejects an uncaptured payment, amount change, and unrelated provider refund', async () => {
    const x = fixture();
    x.request.deliveryConfirmedByCustomerAt = null as never;
    await expect(x.service.adminRefundCapturedTrip(x.input)).rejects.toThrow(
      'not eligible',
    );
    expect(x.stripe.createRefund).not.toHaveBeenCalled();
    x.request.deliveryConfirmedByCustomerAt = new Date();
    await expect(
      x.service.adminRefundCapturedTrip({ ...x.input, expectedAmount: 9 }),
    ).rejects.toThrow('amount changed');
    x.refunds.push({
      id: 're_external',
      status: 'succeeded',
      amount: 100,
      currency: 'chf',
      metadata: {},
    });
    await expect(x.service.adminRefundCapturedTrip(x.input)).rejects.toThrow(
      'Another provider refund',
    );
    expect(x.stripe.createRefund).not.toHaveBeenCalled();
  });
});
