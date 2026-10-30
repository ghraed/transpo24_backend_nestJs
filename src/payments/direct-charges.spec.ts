jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));
import {
  Prisma,
  TransportRequestStatus,
  DriverEarningStatus,
  TripPaymentSettlementStatus,
} from '@prisma/client';
import { StripeService } from './stripe.service';
import { PaymentsService } from './payments.service';
import { directApplicationFee } from './customer-pricing';

const account = 'acct_driver';
const D = (value: string | number) => new Prisma.Decimal(value);

function stripeFixture() {
  const api = {
    paymentMethods: {
      retrieve: jest.fn().mockResolvedValue({
        id: 'pm_saved',
        type: 'card',
        customer: 'cus_platform',
      }),
      create: jest.fn().mockResolvedValue({ id: 'pm_cloned' }),
    },
    paymentIntents: {
      create: jest.fn().mockResolvedValue({ id: 'pi_direct' }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'pi_direct',
        status: 'requires_capture',
        application_fee_amount: 120,
      }),
      confirm: jest
        .fn()
        .mockResolvedValue({ id: 'pi_direct', status: 'requires_capture' }),
      capture: jest
        .fn()
        .mockResolvedValue({ id: 'pi_direct', status: 'succeeded' }),
      cancel: jest
        .fn()
        .mockResolvedValue({ id: 'pi_direct', status: 'canceled' }),
    },
    refunds: { create: jest.fn().mockResolvedValue({ id: 're_direct' }) },
  };
  const service = new StripeService();
  Object.defineProperty(service, 'getClient', { value: () => api });
  return { service, api };
}

describe('Direct Stripe charges', () => {
  it('keeps the existing 5% customer and 15% driver commissions with money rounded to cents', () => {
    expect(directApplicationFee(D('6.30'), D('.30')).toFixed(2)).toBe('1.20');
    expect(directApplicationFee(D('5.25'), D('.25')).toFixed(2)).toBe('1.00');
    expect(directApplicationFee(D('105'), D('5')).toFixed(2)).toBe('20.00');
  });

  it('clones only an owned platform card and creates an unconfirmed manual-capture intent on the driver account', async () => {
    const { service, api } = stripeFixture();
    await service.createManualAuthorization({
      customerId: 'cus_platform',
      stripePaymentMethodId: 'pm_saved',
      stripeAccountId: account,
      amount: 630,
      applicationFeeAmount: 120,
      currency: 'chf',
      metadata: { requestId: 'trip' },
      idempotencyKey: 'booking_generation_1',
      transferGroup: 'trip_1',
    });
    expect(api.paymentMethods.create).toHaveBeenCalledWith(
      { customer: 'cus_platform', payment_method: 'pm_saved' },
      { stripeAccount: account, idempotencyKey: 'booking_generation_1_card' },
    );
    const [body, options] = api.paymentIntents.create.mock.calls[0];
    expect(body).toMatchObject({
      amount: 630,
      application_fee_amount: 120,
      payment_method: 'pm_cloned',
      capture_method: 'manual',
    });
    expect(body).not.toHaveProperty('customer');
    expect(body).not.toHaveProperty('confirm');
    expect(body).not.toHaveProperty('transfer_data');
    expect(options).toEqual({
      stripeAccount: account,
      idempotencyKey: 'booking_generation_1',
    });
  });

  it('rejects another customer’s saved card before cloning or creating an intent', async () => {
    const { service, api } = stripeFixture();
    api.paymentMethods.retrieve.mockResolvedValue({
      id: 'pm_saved',
      type: 'card',
      customer: 'cus_other',
    });
    await expect(
      service.createManualAuthorization({
        customerId: 'cus_platform',
        stripePaymentMethodId: 'pm_saved',
        stripeAccountId: account,
        amount: 630,
        applicationFeeAmount: 120,
        currency: 'chf',
        metadata: {},
        idempotencyKey: 'test',
        transferGroup: 'trip',
      }),
    ).rejects.toThrow('Saved card is not available');
    expect(api.paymentMethods.create).not.toHaveBeenCalled();
    expect(api.paymentIntents.create).not.toHaveBeenCalled();
  });

  it('keeps confirmation, recovery, capture, cancellation and refunds on the original connected account', async () => {
    const { service, api } = stripeFixture();
    await service.confirmManualAuthorization('pi_direct', 'confirm', account);
    await service.inspectAuthorization('pi_direct', account);
    await service.captureAuthorization(
      'pi_direct',
      630,
      'capture',
      account,
      120,
    );
    await service.retrievePaymentIntent('pi_direct', account);
    await service.cancelPaymentIntent('pi_direct', account);
    await service.createRefund({
      paymentIntentId: 'pi_direct',
      stripeAccountId: account,
      amount: 630,
      idempotencyKey: 'refund',
    });
    expect(api.paymentIntents.confirm).toHaveBeenCalledWith(
      'pi_direct',
      expect.anything(),
      { stripeAccount: account, idempotencyKey: 'confirm' },
    );
    expect(api.paymentIntents.capture).toHaveBeenCalledWith(
      'pi_direct',
      { amount_to_capture: 630, application_fee_amount: 120 },
      { stripeAccount: account, idempotencyKey: 'capture' },
    );
    expect(
      api.paymentIntents.retrieve.mock.calls.every(
        (args) => args.at(-1)?.stripeAccount === account,
      ),
    ).toBe(true);
    expect(api.paymentIntents.cancel).toHaveBeenCalledWith(
      'pi_direct',
      {},
      { stripeAccount: account },
    );
    expect(api.refunds.create).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_direct',
        amount: 630,
        refund_application_fee: true,
      },
      { stripeAccount: account, idempotencyKey: 'refund' },
    );
  });

  it('keeps bank-authentication fallback on the same direct intent and account', async () => {
    const { service, api } = stripeFixture();
    api.paymentIntents.confirm.mockRejectedValueOnce({
      payment_intent: 'pi_direct',
    });
    api.paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_direct',
      status: 'requires_payment_method',
      payment_method: null,
      last_payment_error: {
        code: 'authentication_required',
        payment_method: { id: 'pm_cloned' },
      },
    });
    await service.confirmManualAuthorization('pi_direct', 'confirm', account);
    expect(api.paymentIntents.confirm).toHaveBeenLastCalledWith(
      'pi_direct',
      expect.objectContaining({
        payment_method: 'pm_cloned',
        use_stripe_sdk: true,
      }),
      { stripeAccount: account, idempotencyKey: 'confirm_authentication' },
    );
    expect(api.paymentIntents.create).not.toHaveBeenCalled();
  });
});

function payoutFixture() {
  const context = {
    tripStatus: TransportRequestStatus.DELIVERED,
    deliveryConfirmedByCustomerAt: new Date(),
    tripId: 'trip',
    settlementId: 'settlement',
    customerId: 'customer',
    driverUserId: 'driver-user',
    driverId: 'driver',
    currency: 'CHF',
    earningId: 'earning',
    earningStatus: DriverEarningStatus.AVAILABLE as DriverEarningStatus,
    availableAt: new Date(0),
    paidOutAt: null,
    netAmount: D('5.10'),
    chargeAccountId: account as string | null,
    stripePaymentIntentId: 'pi_direct',
    stripeChargeId: 'ch_direct',
    stripeTransferId: null,
    stripeTransferStatus: null,
    destinationAccountId: 'acct_reconnected',
    stripePayoutsEnabled: true,
    stripeDetailsSubmitted: true,
    payoutAttemptCount: 0,
    settlementStatus:
      TripPaymentSettlementStatus.COLLECTED as TripPaymentSettlementStatus,
    requiresManualReview: false,
    collectedAmount: D('6.30'),
    platformShareAmount: D('1.20'),
  };
  const prisma = {
    $transaction: jest.fn(async (callback) => callback(prisma)),
    driverEarning: {
      update: jest.fn(),
      updateMany: jest.fn().mockImplementation(() => {
        context.earningStatus = DriverEarningStatus.PAID_OUT;
        return { count: 1 };
      }),
    },
    tripPaymentSettlement: { update: jest.fn(), updateMany: jest.fn() },
  };
  const stripe = {
    retrievePaymentIntent: jest.fn().mockResolvedValue({
      status: 'succeeded',
      currency: 'chf',
      amount_received: 630,
      application_fee_amount: 120,
    }),
    createTransfer: jest.fn(),
  };
  const notifications = { notifyTripFundsTransferred: jest.fn() };
  const queue = { enqueueDriverPayout: jest.fn().mockResolvedValue(true) };
  const delayed = {
    captureDelivery: jest.fn(async () => {
      context.settlementStatus = TripPaymentSettlementStatus.COLLECTED;
    }),
  };
  const service = new PaymentsService(
    prisma as never,
    stripe as never,
    notifications as never,
    queue as never,
    delayed as never,
  );
  const internals = service as unknown as {
    getDriverPayoutContext(id: string): Promise<typeof context>;
  };
  jest
    .spyOn(internals, 'getDriverPayoutContext')
    .mockImplementation(async () => ({ ...context }));
  return { context, prisma, stripe, notifications, service, delayed };
}

describe('Direct charge release accounting', () => {
  it('captures an eligible authorized direct payment through the existing delivery lifecycle before marking it released', async () => {
    const x = payoutFixture();
    x.context.settlementStatus = TripPaymentSettlementStatus.AUTHORIZED;
    await x.service.processQueuedDriverPayoutJob('trip');
    expect(x.delayed.captureDelivery).toHaveBeenCalledWith(
      'customer',
      'trip',
      true,
    );
    expect(x.stripe.createTransfer).not.toHaveBeenCalled();
    expect(x.notifications.notifyTripFundsTransferred).toHaveBeenCalledTimes(1);
  });

  it('records the captured direct charge once, keeps the pinned account after reconnection and never transfers from the platform', async () => {
    const x = payoutFixture();
    await x.service.processQueuedDriverPayoutJob('trip');
    await x.service.processQueuedDriverPayoutJob('trip');
    expect(x.stripe.retrievePaymentIntent).toHaveBeenCalledWith(
      'pi_direct',
      account,
    );
    expect(x.stripe.createTransfer).not.toHaveBeenCalled();
    expect(x.prisma.driverEarning.updateMany).toHaveBeenCalledTimes(1);
    expect(x.notifications.notifyTripFundsTransferred).toHaveBeenCalledTimes(1);
    expect(x.notifications.notifyTripFundsTransferred).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePaymentIntentId: 'pi_direct',
        amount: '5.10',
      }),
    );
  });

  it.each(['confirmation', 'delay', 'review', 'dispute', 'amount', 'fee'])(
    'keeps the existing release gate: %s',
    async (gate) => {
      const x = payoutFixture();
      if (gate === 'confirmation')
        x.context.deliveryConfirmedByCustomerAt = null as never;
      if (gate === 'delay')
        x.context.availableAt = new Date(Date.now() + 60000);
      if (gate === 'review') x.context.requiresManualReview = true;
      if (gate === 'dispute')
        x.context.settlementStatus = TripPaymentSettlementStatus.DISPUTED;
      if (gate === 'amount')
        x.stripe.retrievePaymentIntent.mockResolvedValue({
          status: 'succeeded',
          currency: 'chf',
          amount_received: 629,
          application_fee_amount: 120,
        });
      if (gate === 'fee')
        x.stripe.retrievePaymentIntent.mockResolvedValue({
          status: 'succeeded',
          currency: 'chf',
          amount_received: 630,
          application_fee_amount: 121,
        });
      await x.service.processQueuedDriverPayoutJob('trip');
      expect(x.prisma.driverEarning.updateMany).not.toHaveBeenCalled();
      expect(x.stripe.createTransfer).not.toHaveBeenCalled();
      expect(x.notifications.notifyTripFundsTransferred).not.toHaveBeenCalled();
    },
  );

  it('preserves already collected platform funds for reconciliation rather than silently recharging', async () => {
    const prior = process.env.STRIPE_DIRECT_CHARGES_ENABLED;
    process.env.STRIPE_DIRECT_CHARGES_ENABLED = 'true';
    try {
      const x = payoutFixture();
      x.context.chargeAccountId = null;
      await x.service.processQueuedDriverPayoutJob('trip');
      expect(x.prisma.tripPaymentSettlement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requiresManualReview: true,
            nextPayoutRetryAt: null,
          }),
        }),
      );
      expect(x.stripe.createTransfer).not.toHaveBeenCalled();
      expect(x.stripe.retrievePaymentIntent).not.toHaveBeenCalled();
    } finally {
      if (prior === undefined) delete process.env.STRIPE_DIRECT_CHARGES_ENABLED;
      else process.env.STRIPE_DIRECT_CHARGES_ENABLED = prior;
    }
  });
});

describe('connected account refund events', () => {
  function fixture(eventAccount = account, refundedMinor = 630) {
    const hold = {
      id: 'hold',
      requestId: 'trip',
      stripeAccountId: account,
      amount: D('6.30'),
      operationAmount: D('6.30'),
    };
    const db = {
      $transaction: jest.fn(async (callback) => callback(db)),
      paymentHold: {
        findUnique: jest.fn().mockResolvedValue(hold),
        update: jest.fn(),
      },
      transportRequest: { update: jest.fn() },
      tripPaymentSettlement: { updateMany: jest.fn() },
      additionalCharge: { findUnique: jest.fn(), update: jest.fn() },
    };
    const stripe = {
      constructWebhookEvent: jest.fn().mockReturnValue({
        type: 'charge.refunded',
        account: eventAccount,
        data: {
          object: {
            id: 'ch_direct',
            payment_intent: 'pi_direct',
            amount_refunded: refundedMinor,
          },
        },
      }),
    };
    const service = new PaymentsService(
      db as never,
      stripe as never,
      {} as never,
    );
    return { db, service };
  }
  it('ignores a signed event for a different connected account', async () => {
    const x = fixture('acct_other');
    await x.service.handleStripeWebhook(Buffer.from('{}'), 'signature', true);
    expect(x.db.paymentHold.update).not.toHaveBeenCalled();
    expect(x.db.tripPaymentSettlement.updateMany).not.toHaveBeenCalled();
  });
  it('does not turn a partial direct refund into a full refund or allow another release', async () => {
    const x = fixture(account, 100);
    await x.service.handleStripeWebhook(Buffer.from('{}'), 'signature', true);
    expect(x.db.paymentHold.update).toHaveBeenCalledWith({
      where: { id: 'hold' },
      data: { status: 'PAYMENT_PARTIALLY_REFUNDED' },
    });
    expect(x.db.tripPaymentSettlement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refundedAmount: D('1'),
          requiresManualReview: true,
          nextPayoutRetryAt: null,
        }),
      }),
    );
  });
  it('records a full refund only for the pinned account', async () => {
    const x = fixture();
    await x.service.handleStripeWebhook(Buffer.from('{}'), 'signature', true);
    expect(x.db.paymentHold.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAYMENT_REFUNDED' }),
      }),
    );
  });
  it('requires reconciliation when a direct additional expense has been refunded', async () => {
    const x = fixture();
    x.db.paymentHold.findUnique.mockResolvedValue(null);
    x.db.additionalCharge.findUnique.mockResolvedValue({
      id: 'expense',
      requestId: 'trip',
      stripeAccountId: account,
    });
    await x.service.handleStripeWebhook(Buffer.from('{}'), 'signature', true);
    expect(x.db.tripPaymentSettlement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requiresManualReview: true,
          nextPayoutRetryAt: null,
        }),
      }),
    );
  });
});

it('clones a saved card for direct additional expenses and refunds zero-fee reimbursements without an application-fee refund', async () => {
  const { service, api } = stripeFixture();
  await service.prepareAdditionalExpense({
    customerId: 'cus_platform',
    stripeAccountId: account,
    stripePaymentMethodId: 'pm_saved',
    additionalChargeId: 'expense',
    amount: 300,
    currency: 'chf',
    applicationFeeAmount: 0,
  });
  expect(api.paymentIntents.create).toHaveBeenCalledWith(
    expect.objectContaining({
      payment_method: 'pm_cloned',
      amount: 300,
      application_fee_amount: 0,
    }),
    { stripeAccount: account, idempotencyKey: 'additional_expense_expense' },
  );
  await service.confirmAdditionalExpense('pi_direct', 'pm_saved', account);
  expect(api.paymentIntents.confirm).toHaveBeenCalledWith(
    'pi_direct',
    { off_session: true },
    { stripeAccount: account },
  );
  api.paymentIntents.retrieve.mockResolvedValue({
    id: 'pi_direct',
    status: 'succeeded',
    application_fee_amount: 0,
  });
  await service.createRefund({
    paymentIntentId: 'pi_direct',
    stripeAccountId: account,
    idempotencyKey: 'expense_refund',
  });
  expect(api.refunds.create).toHaveBeenCalledWith(
    { payment_intent: 'pi_direct' },
    { stripeAccount: account, idempotencyKey: 'expense_refund' },
  );
});

it('uses the separate Connect webhook secret for connected payment events', () => {
  const variables = [
    'STRIPE_MODE',
    'STRIPE_TEST_SECRET_KEY',
    'STRIPE_TEST_WEBHOOK_SECRET',
    'STRIPE_TEST_CONNECT_WEBHOOK_SECRET',
  ];
  const previous = variables.map((name) => process.env[name]);
  try {
    process.env.STRIPE_MODE = 'test';
    process.env.STRIPE_TEST_SECRET_KEY = 'sk_test_fixture';
    process.env.STRIPE_TEST_WEBHOOK_SECRET = 'whsec_platform_fixture';
    process.env.STRIPE_TEST_CONNECT_WEBHOOK_SECRET = 'whsec_connect_fixture';
    const constructEvent = jest.fn().mockReturnValue({
      type: 'payment_intent.succeeded',
      account,
      livemode: false,
    });
    const service = new StripeService();
    Object.defineProperty(service, 'getClient', {
      value: () => ({ webhooks: { constructEvent } }),
    });
    service.constructWebhookEvent(Buffer.from('{}'), 'signature', true);
    expect(constructEvent).toHaveBeenCalledWith(
      Buffer.from('{}'),
      'signature',
      'whsec_connect_fixture',
    );
  } finally {
    variables.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});
