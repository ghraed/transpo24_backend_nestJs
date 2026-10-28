import { BadRequestException, ConflictException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { TripsService } from '../trips/trips.service';
import {
  calculateCustomerPricing,
  customerOfferPrice,
  type CustomerPaymentPrice,
} from './customer-pricing';

jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

const money = (value: number | string) => new Prisma.Decimal(value);

function setup() {
  let hold: any = null;
  let earning: any = null;
  let settlement: any = null;
  const wallet = {
    id: 'wallet',
    customerId: 'client',
    currency: 'USD',
    balance: money(200),
    reservedBalance: money(0),
  };
  const tx: any = {
    $queryRaw: jest.fn(async () => []),
    paymentHold: {
      findUnique: jest.fn(async () => hold),
      update: jest.fn(async ({ data }: any) => Object.assign(hold, data)),
      create: jest.fn(async ({ data }: any) => {
        hold = {
          id: 'hold',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        return hold;
      }),
    },
    user: {
      findUnique: jest.fn(async () => ({
        id: 'client',
        stripeCustomerId: 'cus_client',
      })),
    },
    customerWallet: {
      findUnique: jest.fn(async () => wallet),
      update: jest.fn(async ({ data }: any) => Object.assign(wallet, data)),
    },
    customerWalletTransaction: { create: jest.fn() },
    transportRequest: {
      update: jest.fn(),
      findUnique: jest.fn(async () => ({
        id: 'trip',
        assignedDriverId: 'driver',
        acceptedOfferId: 'offer',
        finalPrice: money(100),
        currency: 'USD',
        status: 'DELIVERED',
        deliveredAt: new Date(),
        paymentHold: hold,
      })),
    },
    tripPaymentSettlement: {
      upsert: jest.fn(async ({ create, update }: any) => {
        settlement = settlement ? Object.assign(settlement, update) : create;
        return settlement;
      }),
      updateMany: jest.fn(async ({ data }: any) => {
        Object.assign(settlement, data);
        return { count: 1 };
      }),
    },
    driverOffer: {
      findUnique: jest.fn(async () => ({ price: money(100), currency: 'USD' })),
    },
    additionalCharge: {
      aggregate: jest.fn(async () => ({ _sum: { amount: null } })),
    },
    driverEarning: {
      findUnique: jest.fn(async () => earning),
      create: jest.fn(async ({ data }: any) => {
        earning = { id: 'earning', ...data };
        return earning;
      }),
    },
  };
  const stripe = {
    mode: 'test',
    ensureCustomer: jest.fn(async () => 'cus_client'),
    createImmediateCaptureIntent: jest.fn(async () => ({
      id: 'pi_trip',
      status: 'succeeded',
      latest_charge: 'ch_trip',
      client_secret: 'secret',
    })),
  };
  const payments = new PaymentsService(
    {
      ...tx,
      $transaction: (fn: (client: unknown) => unknown) => fn(tx),
    } as never,
    stripe as never,
    {} as never,
  );
  const trips = new TripsService({} as never, {} as never);
  const collect = (
    paymentMethod: PaymentMethod,
    amount = money(100),
    currency = 'USD',
  ) =>
    payments.createHoldForAcceptedOffer(tx as Prisma.TransactionClient, {
      customerId: 'client',
      requestId: 'trip',
      acceptedOfferId: 'offer',
      driverId: 'driver',
      amount,
      currency,
      paymentMethod,
    });
  return {
    tx,
    stripe,
    payments,
    trips,
    wallet,
    collect,
    hold: () => hold,
    earning: () => earning,
    settlement: () => settlement,
  };
}

describe('Client platform commission', () => {
  it.each([
    'CREDIT_CARD',
    'DEBIT_CARD',
    'APPLE_PAY',
    'GOOGLE_PAY',
    'APP_WALLET',
  ] as PaymentMethod[])(
    '%s collects $105 and splits it into $85 driver earnings and $20 platform revenue',
    async (method) => {
      const model = setup();
      const payment = await model.collect(method);
      expect(payment.amount).toBe(105);
      expect(payment.capturedAmount).toBe(105);
      expect(payment.customerPlatformFeeAmount).toBe(5);
      expect(model.hold().amount.toString()).toBe('105');
      expect(model.hold().customerPlatformFeeAmount.toString()).toBe('5');
      expect(model.settlement().collectedAmount.toString()).toBe('105');
      if (method === 'APP_WALLET') {
        expect(model.wallet.balance.toString()).toBe('95');
        expect(
          model.stripe.createImmediateCaptureIntent,
        ).not.toHaveBeenCalled();
        expect(model.tx.customerWalletTransaction.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ amount: money(105) }),
          }),
        );
      } else {
        expect(model.stripe.createImmediateCaptureIntent).toHaveBeenCalledWith(
          expect.objectContaining({ amount: 10500 }),
        );
      }
      await model.trips.createDriverEarningForDeliveredTrip(
        model.tx as Prisma.TransactionClient,
        'trip',
      );
      expect(model.earning().grossAmount.toString()).toBe('100');
      expect(model.earning().platformFeeAmount.toString()).toBe('15');
      expect(model.earning().netAmount.toString()).toBe('85');
      expect(model.settlement().platformShareAmount.toString()).toBe('20');
      expect(model.settlement().driverShareAmount.toString()).toBe('85');
      expect(model.settlement().retainedAmount.toString()).toBe('105');
      expect(
        model
          .settlement()
          .driverShareAmount.add(model.settlement().platformShareAmount)
          .toString(),
      ).toBe('105');

      // A retry cannot charge again or recreate earnings.
      await expect(model.collect(method)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await model.trips.createDriverEarningForDeliveredTrip(
        model.tx as Prisma.TransactionClient,
        'trip',
      );
      expect(model.tx.paymentHold.create).toHaveBeenCalledTimes(1);
      expect(model.tx.driverEarning.create).toHaveBeenCalledTimes(1);
    },
  );

  it('conserves every cent across 10,000 prices and high-value offer boundaries', () => {
    const trips = new TripsService({} as never, {} as never);
    const cents = [
      ...Array.from({ length: 10000 }, (_, i) => i + 100),
      9999999,
      10000000,
    ];
    for (const baseCents of cents) {
      const base = money(baseCents).div(100);
      const pricing = calculateCustomerPricing(base);
      const earning = trips.calculateDriverEarningAmounts(base);
      // An independent integer oracle catches rounding and accidental double fees.
      const clientFeeCents = Math.floor((baseCents * 5 + 50) / 100);
      const driverFeeCents = Math.floor((baseCents * 15 + 50) / 100);
      expect([
        pricing.customerPlatformFeeAmount.mul(100).toNumber(),
        pricing.totalAmount.mul(100).toNumber(),
        earning.netAmount.mul(100).toNumber(),
        earning.platformFeeAmount
          .add(pricing.customerPlatformFeeAmount)
          .mul(100)
          .toNumber(),
      ]).toEqual([
        clientFeeCents,
        baseCents + clientFeeCents,
        baseCents - driverFeeCents,
        driverFeeCents + clientFeeCents,
      ]);
      expect(
        earning.netAmount
          .add(earning.platformFeeAmount)
          .add(pricing.customerPlatformFeeAmount)
          .equals(pricing.totalAmount),
      ).toBe(true);
    }
  });

  it.each(['USD', 'EUR', 'CHF', 'AED'])(
    'uses the same rounded total in %s pricing, wallet capture, and settlement',
    async (currency) => {
      const model = setup();
      model.wallet.currency = currency;
      const payment = await model.collect(
        'APP_WALLET',
        money('19.99'),
        currency,
      );
      expect(payment).toMatchObject({
        amount: 20.99,
        customerPlatformFeeAmount: 1,
        currency,
      });
      expect(model.wallet.balance.toString()).toBe('179.01');
      expect(model.settlement().collectedAmount.toString()).toBe('20.99');
    },
  );

  it('accepts an exact wallet balance and excludes reserved funds from available balance', async () => {
    const exact = setup();
    exact.wallet.balance = money(105);
    await exact.collect('APP_WALLET');
    expect(exact.wallet.balance.toString()).toBe('0');
    const reserved = setup();
    reserved.wallet.balance = money(110);
    reserved.wallet.reservedBalance = money(10);
    await expect(reserved.collect('APP_WALLET')).rejects.toThrow(
      'insufficient',
    );
    expect(reserved.tx.customerWallet.update).not.toHaveBeenCalled();
  });

  it('does not debit a wallet in a different currency', async () => {
    const model = setup();
    model.wallet.currency = 'CHF';
    await expect(model.collect('APP_WALLET')).rejects.toThrow('CHF');
    expect(model.tx.customerWallet.update).not.toHaveBeenCalled();
  });

  it('does not persist a captured payment or settlement when Stripe fails', async () => {
    const model = setup();
    model.stripe.createImmediateCaptureIntent.mockRejectedValueOnce(
      new Error('Stripe unavailable'),
    );
    await expect(model.collect('CREDIT_CARD')).rejects.toThrow(
      'Stripe unavailable',
    );
    expect(model.tx.paymentHold.create).not.toHaveBeenCalled();
    expect(model.tx.tripPaymentSettlement.upsert).not.toHaveBeenCalled();
    expect(model.tx.transportRequest.update).not.toHaveBeenCalled();
  });

  it('captures the full $105 from a webhook exactly once and keeps the commission snapshot', async () => {
    const model = setup();
    model.stripe.createImmediateCaptureIntent.mockResolvedValue({
      id: 'pi_trip',
      status: 'requires_action',
      latest_charge: 'ch_trip',
      client_secret: 'secret',
    });
    await model.collect('CREDIT_CARD');
    model.tx.tripPaymentSettlement.upsert.mockClear();
    const event = {
      id: 'pi_trip',
      amount: 10500,
      currency: 'usd',
      status: 'succeeded',
      latest_charge: 'ch_trip',
    };
    await (model.payments as any).syncStripePaymentIntent(
      event,
      'payment_intent.succeeded',
    );
    await (model.payments as any).syncStripePaymentIntent(
      event,
      'payment_intent.succeeded',
    );
    expect(model.hold().status).toBe('PAYMENT_CAPTURED');
    expect(model.hold().customerPlatformFeeAmount.toString()).toBe('5');
    expect(model.settlement().collectedAmount.toString()).toBe('105');
    expect(model.tx.paymentHold.update).toHaveBeenCalledTimes(1);
    expect(model.tx.tripPaymentSettlement.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    [10000, 'usd'],
    [11025, 'usd'],
    [10500, 'eur'],
  ])(
    'rejects a webhook for the wrong total or currency (%i %s) without changing money records',
    async (amount, currency) => {
      const model = setup();
      await model.collect('CREDIT_CARD');
      model.tx.tripPaymentSettlement.upsert.mockClear();
      await expect(
        (model.payments as any).syncStripePaymentIntent(
          { id: 'pi_trip', amount, currency, status: 'succeeded' },
          'payment_intent.succeeded',
        ),
      ).rejects.toThrow('does not match');
      expect(model.tx.paymentHold.update).not.toHaveBeenCalled();
      expect(model.tx.tripPaymentSettlement.upsert).not.toHaveBeenCalled();
    },
  );

  it('transfers only the $85 driver net to Stripe Connect', async () => {
    const createTransfer = jest.fn(async () => ({ id: 'tr_driver' }));
    const service = new PaymentsService(
      {
        driverEarning: { update: jest.fn() },
        tripPaymentSettlement: { update: jest.fn() },
      } as never,
      { createTransfer } as never,
      { notifyTripFundsTransferred: jest.fn() } as never,
    );
    jest.spyOn(service as any, 'getDriverPayoutContext').mockResolvedValue({
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
      netAmount: money(85),
      currency: 'USD',
      stripeChargeId: 'ch_trip',
      destinationAccountId: 'acct_driver',
      stripePayoutsEnabled: true,
    });
    const result = await (service as any).attemptDriverPayoutForTrip('trip', {
      requestedBy: 'automatic_retry',
    });
    expect(result.transferred).toBe(true);
    expect(createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 8500, destination: 'acct_driver' }),
    );
  });

  it('checks wallet funds against the client total, including commission', async () => {
    const model = setup();
    model.wallet.balance = money(100);
    await expect(model.collect('APP_WALLET')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(model.tx.paymentHold.create).not.toHaveBeenCalled();
    expect(model.tx.customerWallet.update).not.toHaveBeenCalled();
  });

  it('includes commission in a pending card authorization', async () => {
    const model = setup();
    model.stripe.createImmediateCaptureIntent.mockResolvedValue({
      id: 'pi_trip',
      status: 'requires_action',
      latest_charge: 'ch_trip',
      client_secret: 'secret',
    });
    const payment = await model.collect('CREDIT_CARD');
    expect(payment.amount).toBe(105);
    expect(payment.heldAmount).toBe(105);
    expect(payment.capturedAmount).toBe(0);
    expect(payment.customerPlatformFeeAmount).toBe(5);
  });

  it('preserves historical payments and their original 15% platform share', async () => {
    const model = setup();
    await model.collect('APP_WALLET');
    model.hold().amount = money(100);
    model.hold().customerPlatformFeeAmount = money(0);
    model.settlement().collectedAmount = money(100);
    expect(
      customerOfferPrice(money(100), model.hold() as CustomerPaymentPrice),
    ).toEqual({
      price: 100,
      customerPlatformFeeAmount: 0,
    });
    await model.trips.createDriverEarningForDeliveredTrip(
      model.tx as Prisma.TransactionClient,
      'trip',
    );
    expect(model.earning().netAmount.toString()).toBe('85');
    expect(model.settlement().platformShareAmount.toString()).toBe('15');
    expect(model.settlement().retainedAmount.toString()).toBe('100');
  });

  it('keeps reimbursed expenses outside both commissions', async () => {
    const model = setup();
    await model.collect('APP_WALLET');
    model.tx.additionalCharge.aggregate.mockResolvedValue({
      _sum: { amount: money(10) },
    });
    await model.trips.createDriverEarningForDeliveredTrip(
      model.tx as Prisma.TransactionClient,
      'trip',
    );
    expect(model.earning().grossAmount.toString()).toBe('110');
    expect(model.earning().netAmount.toString()).toBe('95');
    expect(model.settlement().platformShareAmount.toString()).toBe('20');
    expect(model.settlement().retainedAmount.toString()).toBe('105');
  });

  it.each([
    ['100', '5', '105'],
    ['19.99', '1', '20.99'],
    ['0.10', '0.01', '0.11'],
  ])(
    'rounds the commission on %s to cents and adds it exactly once',
    (base, fee, total) => {
      const pricing = calculateCustomerPricing(money(base));
      expect(pricing.customerPlatformFeeAmount.toString()).toBe(fee);
      expect(pricing.totalAmount.toString()).toBe(total);
      expect(customerOfferPrice(money(base))).toEqual({
        price: Number(total),
        customerPlatformFeeAmount: Number(fee),
      });
    },
  );
});
