import { Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';

function fixture() {
  const charge = {
    id: 'extra',
    requestId: 'request',
    customerId: 'customer',
    driverId: 'driver',
    amount: new Prisma.Decimal(20),
    currency: 'CHF',
    reason: 'Parking',
    invoiceUrl: '/fixture',
    equipmentType: null,
    invoiceOriginalFilename: null,
    invoiceMimeType: null,
    invoiceSizeBytes: null,
    approvedAt: null,
    approvedByCustomerId: null,
    approvalLocale: null,
    approvalConfirmationText: null,
    stripePaymentIntentId: null as string | null,
    stripeChargeId: null,
    savedPaymentMethodId: null,
    savedPaymentMethodBrand: null,
    savedPaymentMethodLast4: null,
    savedPaymentMethodExpMonth: null,
    savedPaymentMethodExpYear: null,
    paymentFailureReason: null,
    approvalInFlightAt: null as Date | null,
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const earning = {
    id: 'earning',
    status: 'PENDING',
    stripeTransferId: null,
    grossAmount: new Prisma.Decimal(100),
    netAmount: new Prisma.Decimal(90),
  };
  const intent = {
    id: 'pi_extra',
    status: 'requires_payment_method',
    amount: 2000,
    currency: 'chf',
    latest_charge: 'ch_extra',
  };
  const db = {
    $queryRaw: jest.fn(async () => []),
    additionalCharge: {
      findFirst: jest.fn(async () => ({ ...charge })),
      findUnique: jest.fn(
        async ({ where }: { where: { stripePaymentIntentId?: string } }) =>
          where.stripePaymentIntentId === charge.stripePaymentIntentId
            ? { ...charge }
            : null,
      ),
      findUniqueOrThrow: jest.fn(async () => ({ ...charge })),
      findMany: jest.fn(async () => [
        { stripePaymentIntentId: charge.stripePaymentIntentId },
      ]),
      update: jest.fn(async ({ data }: { data: object }) =>
        Object.assign(charge, data),
      ),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { status?: { not?: string } };
          data: object;
        }) => {
          if (where.status?.not === charge.status) return { count: 0 };
          if (
            'approvalInFlightAt' in data &&
            data.approvalInFlightAt &&
            charge.approvalInFlightAt
          )
            return { count: 0 };
          Object.assign(charge, data);
          return { count: 1 };
        },
      ),
    },
    transportRequest: {
      findUnique: jest.fn(async () => ({
        customerId: 'customer',
        status: 'IN_TRANSIT',
      })),
    },
    user: {
      findUnique: jest.fn(async () => ({
        id: 'customer',
        stripeCustomerId: 'cus_customer',
      })),
    },
    driverProfile: {
      findUnique: jest.fn(async () => ({ userId: 'driver-user' })),
    },
    driverEarning: {
      findUnique: jest.fn(async () => earning),
      update: jest.fn(
        async ({
          data,
        }: {
          data: {
            grossAmount: { increment: Prisma.Decimal };
            netAmount: { increment: Prisma.Decimal };
          };
        }) => {
          earning.grossAmount = earning.grossAmount.add(
            data.grossAmount.increment,
          );
          earning.netAmount = earning.netAmount.add(data.netAmount.increment);
        },
      ),
    },
    $transaction: jest.fn(),
  };
  // Serialize transactions, as the real request/expense row locks do.
  let tail = Promise.resolve();
  db.$transaction.mockImplementation(
    (fn: (tx: typeof db) => Promise<unknown>) => {
      const result = tail.then(() => fn(db));
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  );
  const stripe = {
    ensureCustomer: jest.fn(async () => 'cus_customer'),
    getCustomerDefaultPaymentMethod: jest.fn(async () => ({
      id: 'pm_card',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
    })),
    prepareAdditionalExpense: jest.fn(async () => ({ ...intent })),
    retrievePaymentIntent: jest.fn(async () => ({ ...intent })),
    confirmAdditionalExpense: jest.fn(async () => {
      // The operation must already be durable before the provider can charge.
      expect(charge.stripePaymentIntentId).toBe(intent.id);
      intent.status = 'succeeded';
      return { ...intent };
    }),
    cancelPaymentIntentIfExists: jest.fn(async () => {
      intent.status = 'canceled';
    }),
  };
  const notifications = {
    notifyDriverAdditionalChargeApproved: jest.fn(async () => {}),
  };
  const service = new PaymentsService(
    db as never,
    stripe as never,
    notifications as never,
  );
  const input = {
    customerId: 'customer',
    requestId: 'request',
    chargeId: 'extra',
    confirmationLocale: 'en',
    confirmationText: 'Approve CHF 20',
    paymentOption: 'SAVED_CARD' as const,
  };
  return { service, charge, earning, intent, db, stripe, notifications, input };
}

describe('Additional expense financial effects', () => {
  it('charges the expense and fee immediately, allocates only the expense, and blocks duplicate approval', async () => {
    const x = fixture();
    const result = await x.service.approveAdditionalCharge(x.input);
    expect(result.totalChargeAmount).toBe(20);
    expect(x.stripe.prepareAdditionalExpense).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2000 }),
    );
    expect(x.charge.status).toBe('CAPTURED');
    expect(x.earning.grossAmount.toNumber()).toBe(120);
    await expect(x.service.approveAdditionalCharge(x.input)).rejects.toThrow(
      'already been approved',
    );
    expect(x.stripe.confirmAdditionalExpense).toHaveBeenCalledTimes(1);
  });

  it('records cash due without creating or confirming a card payment', async () => {
    const x = fixture();
    const result = await x.service.approveAdditionalCharge({
      ...x.input,
      paymentOption: 'CASH_ON_DELIVERY',
    });
    expect(result.payment.paymentOption).toBe('CASH_ON_DELIVERY');
    expect(x.stripe.prepareAdditionalExpense).not.toHaveBeenCalled();
    expect(x.stripe.confirmAdditionalExpense).not.toHaveBeenCalled();
  });

  it('does not mark a declined expense paid or allocate driver earnings', async () => {
    const x = fixture();
    x.stripe.confirmAdditionalExpense.mockImplementationOnce(async () => {
      throw new Error('Card declined');
    });
    await expect(x.service.approveAdditionalCharge(x.input)).rejects.toThrow(
      'Card declined',
    );
    expect(x.charge.status).toBe('FAILED');
    expect(x.earning.grossAmount.toNumber()).toBe(100);
  });

  it('recovers a successful charge after the provider response is lost, without a second charge', async () => {
    const x = fixture();
    x.stripe.confirmAdditionalExpense.mockImplementationOnce(async () => {
      x.intent.status = 'succeeded';
      throw new Error('Connection lost');
    });
    await x.service.approveAdditionalCharge(x.input);
    expect(x.charge.status).toBe('CAPTURED');
    expect(x.stripe.confirmAdditionalExpense).toHaveBeenCalledTimes(1);
  });

  it('keeps uncertain results pending and reuses the persisted intent on retry', async () => {
    const x = fixture();
    x.stripe.confirmAdditionalExpense.mockImplementationOnce(async () => {
      x.intent.status = 'succeeded';
      x.stripe.retrievePaymentIntent.mockRejectedValueOnce(
        new Error('Provider unavailable'),
      );
      throw new Error('Connection lost');
    });
    await expect(x.service.approveAdditionalCharge(x.input)).rejects.toThrow(
      'Connection lost',
    );
    expect(x.charge.status).toBe('PENDING');
    await x.service.approveAdditionalCharge(x.input);
    expect(x.charge.status).toBe('CAPTURED');
    expect(x.stripe.prepareAdditionalExpense).toHaveBeenCalledTimes(1);
    expect(x.stripe.confirmAdditionalExpense).toHaveBeenCalledTimes(1);
    expect(x.earning.grossAmount.toNumber()).toBe(120);
  });

  it('does not downgrade or recharge a paid expense when its notification fails', async () => {
    const x = fixture();
    x.notifications.notifyDriverAdditionalChargeApproved.mockRejectedValueOnce(
      new Error('Push unavailable'),
    );
    await x.service.approveAdditionalCharge(x.input);
    expect(x.charge.status).toBe('CAPTURED');
    await expect(x.service.approveAdditionalCharge(x.input)).rejects.toThrow(
      'already been approved',
    );
    expect(x.stripe.confirmAdditionalExpense).toHaveBeenCalledTimes(1);
  });

  it('reconciles repeated late success events once and ignores delayed failures', async () => {
    const x = fixture();
    x.charge.stripePaymentIntentId = x.intent.id;
    x.intent.status = 'succeeded';
    await Promise.all([
      x.service.recoverAdditionalExpensePayments(),
      x.service.recoverAdditionalExpensePayments(),
    ]);
    expect(x.earning.grossAmount.toNumber()).toBe(120);
    x.intent.status = 'requires_payment_method';
    await x.service.recoverAdditionalExpensePayments();
    expect(x.charge.status).toBe('CAPTURED');
    expect(x.earning.grossAmount.toNumber()).toBe(120);
  });

  it('blocks choosing cash while a card payment has an uncertain or successful outcome', async () => {
    const x = fixture();
    x.charge.stripePaymentIntentId = x.intent.id;
    x.intent.status = 'processing';
    await expect(
      x.service.approveAdditionalCharge({
        ...x.input,
        paymentOption: 'CASH_ON_DELIVERY',
      }),
    ).rejects.toThrow('pending');
    expect(x.stripe.cancelPaymentIntentIfExists).not.toHaveBeenCalled();
    expect(x.charge.status).toBe('PENDING');
  });
});
