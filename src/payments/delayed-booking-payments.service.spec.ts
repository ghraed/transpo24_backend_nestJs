import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DelayedBookingPaymentsService } from './delayed-booking-payments.service';
import {
  BANK_APPROVAL_MS,
  PAYMENT_POLICY_VERSION,
  paymentPolicy,
} from './payment-policy';

const D = (value: number | string) => new Prisma.Decimal(value);
const start = new Date('2026-10-28T10:00:00Z');

// The database mock rolls back mutations on failure; Stripe's state deliberately does
// not roll back. This exercises recovery after the provider succeeds but the DB fails.
function setup(method = 'APP_WALLET') {
  const state: any = {
    hold: null,
    request: {
      id: 'request',
      customerId: 'customer',
      status: 'QUOTED',
      assignedDriverId: null,
    },
    wallet: {
      id: 'wallet',
      customerId: 'customer',
      currency: 'CHF',
      balance: D(200),
      reservedBalance: D(0),
    },
    settlement: null,
    transactions: [],
  };
  const merge = (row: any, data: any) => {
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value && typeof value === 'object' && 'increment' in value)
        row[key] =
          row[key] instanceof Prisma.Decimal
            ? row[key].add(value.increment as number)
            : (row[key] ?? 0) + value.increment;
      else if (value && typeof value === 'object' && 'decrement' in value)
        row[key] = row[key].sub(value.decrement);
      else row[key] = value;
    }
    return row;
  };
  let failCommit = false;
  const db: any = {
    $queryRaw: jest.fn(async () => []),
    driverOffer: {
      findUnique: jest.fn(async () => ({
        status: 'PENDING',
        driver: {
          status: 'APPROVED',
          isProfileCompleted: true,
          vehicles: [{}],
        },
      })),
    },
    user: {
      findUniqueOrThrow: jest.fn(async () => ({
        id: 'customer',
        stripeCustomerId: 'cus_1',
      })),
    },
    paymentHold: {
      create: jest.fn(
        async ({ data }) =>
          (state.hold = {
            id: 'hold',
            createdAt: start,
            updatedAt: start,
            authorizationAttempt: 0,
            ...data,
          }),
      ),
      findUnique: jest.fn(async () => state.hold),
      findUniqueOrThrow: jest.fn(async () => state.hold),
      update: jest.fn(async ({ data }) => merge(state.hold, data)),
    },
    transportRequest: {
      findUnique: jest.fn(async () => state.request),
      findUniqueOrThrow: jest.fn(async () => ({
        ...state.request,
        paymentHold: state.hold,
      })),
      update: jest.fn(async ({ data }) => merge(state.request, data)),
    },
    customerWallet: {
      findUnique: jest.fn(async () => state.wallet),
      findUniqueOrThrow: jest.fn(async () => state.wallet),
      update: jest.fn(async ({ data }) => merge(state.wallet, data)),
    },
    customerWalletTransaction: {
      create: jest.fn(async ({ data }) => state.transactions.push(data)),
    },
    tripPaymentSettlement: {
      upsert: jest.fn(
        async ({ create, update }) =>
          (state.settlement = state.settlement
            ? merge(state.settlement, update)
            : { ...create }),
      ),
      updateMany: jest.fn(async ({ data }) => {
        if (state.settlement) merge(state.settlement, data);
      }),
    },
    driverEarning: { upsert: jest.fn(async () => ({})) },
  };
  db.$transaction = jest.fn(async (callback) => {
    const snapshot = {
      hold: state.hold && { ...state.hold },
      request: { ...state.request },
      wallet: { ...state.wallet },
      settlement: state.settlement && { ...state.settlement },
      transactions: [...state.transactions],
    };
    try {
      const result = await callback(db);
      if (failCommit) {
        failCommit = false;
        throw new Error('Database connection lost during commit');
      }
      return result;
    } catch (error) {
      Object.assign(state, snapshot);
      throw error;
    }
  });
  const intents = new Map<string, any>();
  const stripe: any = {
    validateOwnedCard: jest.fn(async () => ({})),
    createManualAuthorization: jest.fn(async (input) => {
      const id = `pi_${input.idempotencyKey}`;
      if (!intents.has(id))
        intents.set(id, {
          id,
          status: 'requires_confirmation',
          amount: input.amount,
          currency: input.currency,
          client_secret: `${id}_secret`,
          amount_received: 0,
          latest_charge: {
            id: 'ch_1',
            payment_method_details: {
              card: {
                capture_before: Math.floor(
                  (start.getTime() + 5 * 86400000) / 1000,
                ),
              },
            },
          },
        });
      return intents.get(id);
    }),
    inspectAuthorization: jest.fn(async (id: string) => ({
      ...intents.get(id),
    })),
    confirmManualAuthorization: jest.fn(async (id: string) => {
      intents.get(id).status = 'requires_capture';
      return { ...intents.get(id) };
    }),
    cancelPaymentIntentIfExists: jest.fn(async (id: string) => {
      intents.get(id).status = 'canceled';
      return intents.get(id);
    }),
    captureAuthorization: jest.fn(async (id: string, amount: number) => {
      Object.assign(intents.get(id), {
        status: 'succeeded',
        amount_received: amount,
      });
      return { ...intents.get(id) };
    }),
  };
  const notifications = {
    notifyCustomerTripUpdate: jest.fn(),
    notifyDriverSelected: jest.fn(),
  };
  const service = new DelayedBookingPaymentsService(
    db as never,
    stripe as never,
    notifications as never,
  );
  service.ready = true;
  const input: any = {
    customerId: 'customer',
    requestId: 'request',
    acceptedOfferId: 'offer',
    driverId: 'driver',
    amount: D(105),
    customerPlatformFeeAmount: D(5),
    currency: 'CHF',
    paymentMethod: method,
    stripePaymentMethodId: method === 'APP_WALLET' ? undefined : 'pm_1',
    policyVersion: PAYMENT_POLICY_VERSION,
  };
  const stage = () => service.stage(db as never, input as never);
  const due = () => jest.setSystemTime(start.getTime() + 600000);
  const authorize = async () => {
    await stage();
    due();
    await service.process('request');
    if (method !== 'APP_WALLET') await service.process('request');
  };
  return {
    service,
    state,
    db,
    stripe,
    intents,
    notifications,
    input,
    stage,
    due,
    authorize,
    loseCommit: () => {
      failCommit = true;
    },
  };
}

describe('delayed booking money lifecycle', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(start));
  afterEach(() => jest.useRealTimers());

  it('persists the selected offer and deadline without reserving or charging booking funds', async () => {
    const x = setup('CREDIT_CARD');
    await x.stage();
    expect(x.state.hold).toMatchObject({
      acceptedOfferId: 'offer',
      confirmationState: 'GRACE_PERIOD',
      authorizationDueAt: new Date(start.getTime() + 600000),
    });
    expect(x.stripe.createManualAuthorization).not.toHaveBeenCalled();
    expect(x.db.customerWallet.update).not.toHaveBeenCalled();
    expect(x.state.request.assignedDriverId).toBeNull();
    expect(x.state.request.heldAmount.toNumber()).toBe(0);
  });

  it.each(['APP_WALLET', 'CREDIT_CARD'])(
    'notifies both recipients only after the countdown, successful hold, and assignment (%s)',
    async (method) => {
      const x = setup(method);
      await x.stage();
      await x.service.notifyState('request');
      x.due();
      await x.service.process('request');
      await x.service.notifyState('request');
      if (method === 'CREDIT_CARD') await x.service.process('request');
      await x.service.notifyState('request');
      expect(x.notifications.notifyCustomerTripUpdate).not.toHaveBeenCalled();
      expect(x.notifications.notifyDriverSelected).not.toHaveBeenCalled();
      Object.assign(x.state.request, {
        assignedDriverId: 'driver',
        assignedDriver: { userId: 'driver-user' },
        service: { nameEn: 'Transport' },
        status: 'DRIVER_ASSIGNED',
      });
      await x.service.notifyState('request');
      await x.service.notifyState('request');
      expect(x.notifications.notifyCustomerTripUpdate).toHaveBeenCalledWith(
        'request',
        'BOOKING_FUNDS_RESERVED',
        true,
      );
      expect(x.notifications.notifyDriverSelected).toHaveBeenCalledWith({
        driverUserId: 'driver-user',
        requestId: 'request',
        serviceType: 'Transport',
        retryPersistedEvent: true,
      });
      expect(x.notifications.notifyCustomerTripUpdate).toHaveBeenCalledTimes(1);
      expect(x.notifications.notifyDriverSelected).toHaveBeenCalledTimes(1);
      expect(x.state.hold.clientFundsReservedNotifiedAt).toBeInstanceOf(Date);
      expect(x.state.hold.driverAcceptanceNotifiedAt).toBeInstanceOf(Date);
    },
  );

  it.each(['customer', 'driver'])(
    'retries a failed %s notification without resending the other recipient',
    async (recipient) => {
      const x = setup('CREDIT_CARD');
      await x.authorize();
      Object.assign(x.state.request, {
        assignedDriverId: 'driver',
        assignedDriver: { userId: 'driver-user' },
        service: { nameEn: 'Transport' },
        status: 'DRIVER_ASSIGNED',
      });
      const failed =
        recipient === 'customer'
          ? x.notifications.notifyCustomerTripUpdate
          : x.notifications.notifyDriverSelected;
      const other =
        recipient === 'customer'
          ? x.notifications.notifyDriverSelected
          : x.notifications.notifyCustomerTripUpdate;
      failed.mockRejectedValueOnce(new Error('Push unavailable'));
      await expect(x.service.notifyState('request')).rejects.toThrow(
        'Push unavailable',
      );
      expect(other).toHaveBeenCalledTimes(1);
      expect(
        x.state.hold[
          recipient === 'customer'
            ? 'driverAcceptanceNotifiedAt'
            : 'clientFundsReservedNotifiedAt'
        ],
      ).toBeInstanceOf(Date);
      await x.service.notifyState('request');
      expect(failed).toHaveBeenCalledTimes(2);
      expect(other).toHaveBeenCalledTimes(1);
    },
  );

  it('does not send acceptance notifications while awaiting bank approval or after a decline', async () => {
    const x = setup('CREDIT_CARD');
    await x.stage();
    x.due();
    await x.service.process('request');
    x.stripe.confirmManualAuthorization.mockImplementationOnce(
      async (id: string) => {
        x.intents.get(id).status = 'requires_action';
        return x.intents.get(id);
      },
    );
    await x.service.process('request');
    await x.service.notifyState('request');
    expect(x.notifications.notifyCustomerTripUpdate).toHaveBeenCalledWith(
      'request',
      'BOOKING_BANK_APPROVAL_REQUIRED',
      true,
    );
    expect(x.notifications.notifyCustomerTripUpdate).not.toHaveBeenCalledWith(
      'request',
      'BOOKING_FUNDS_RESERVED',
      true,
    );
    expect(x.notifications.notifyDriverSelected).not.toHaveBeenCalled();
    x.intents.get(x.state.hold.stripePaymentIntentId as string).status =
      'requires_payment_method';
    await x.service.process('request');
    await x.service.notifyState('request');
    expect(x.state.request.status).toBe('CANCELLED');
    expect(x.notifications.notifyCustomerTripUpdate).not.toHaveBeenCalledWith(
      'request',
      'BOOKING_FUNDS_RESERVED',
      true,
    );
    expect(x.notifications.notifyDriverSelected).not.toHaveBeenCalled();
  });

  it('does not repeat acceptance notifications when the card hold is renewed', async () => {
    const x = setup('CREDIT_CARD');
    await x.authorize();
    Object.assign(x.state.request, {
      assignedDriverId: 'driver',
      assignedDriver: { userId: 'driver-user' },
      service: { nameEn: 'Transport' },
      status: 'DRIVER_ASSIGNED',
    });
    await x.service.notifyState('request');
    jest.setSystemTime(x.state.hold.authorizationExpiresAt.getTime() - 60000);
    await x.service.process('request');
    await x.service.process('request');
    await x.service.process('request');
    await x.service.notifyState('request');
    expect(x.notifications.notifyCustomerTripUpdate).toHaveBeenCalledTimes(1);
    expect(x.notifications.notifyDriverSelected).toHaveBeenCalledTimes(1);
  });

  it('rejects outdated terms and an unavailable worker before creating a booking', async () => {
    const x = setup();
    x.input.policyVersion = 'old';
    await expect(x.stage()).rejects.toBeInstanceOf(ConflictException);
    expect(x.db.paymentHold.create).not.toHaveBeenCalled();
    x.input.policyVersion = PAYMENT_POLICY_VERSION;
    x.service.ready = false;
    await expect(x.stage()).rejects.toThrow('temporarily unavailable');
  });

  it('does nothing before ten minutes and reserves wallet funds exactly at the deadline only once', async () => {
    const x = setup();
    await x.stage();
    jest.setSystemTime(start.getTime() + 599999);
    await x.service.process('request');
    expect(x.state.wallet.reservedBalance.toNumber()).toBe(0);
    x.due();
    await x.service.process('request');
    await x.service.process('request');
    expect(x.state.wallet.balance.toNumber()).toBe(200);
    expect(x.state.wallet.reservedBalance.toNumber()).toBe(105);
    expect(
      x.state.wallet.balance.sub(x.state.wallet.reservedBalance).toNumber(),
    ).toBe(95);
    expect(x.state.transactions.map((t: any) => t.type)).toEqual(['HOLD']);
    expect(x.state.settlement.collectedAmount.toNumber()).toBe(0);
    expect(x.state.request.assignedDriverId).toBeNull();
  });

  it('rechecks wallet availability at the deadline and cancels an unfunded request for free', async () => {
    const x = setup();
    await x.stage();
    x.state.wallet.balance = D(50);
    x.due();
    await x.service.process('request');
    expect(x.state.request.status).toBe('CANCELLED');
    expect(x.state.wallet.balance.toNumber()).toBe(50);
    expect(x.state.transactions).toEqual([]);
  });

  it('cancels during the grace period with no charge, refund, or wallet mutation', async () => {
    const x = setup();
    await x.stage();
    const result = await x.service.cancel('customer', 'request');
    expect(result).toMatchObject({
      retainedAmount: 0,
      refundedAmount: 0,
      releasedAmount: 0,
      nothingCharged: true,
    });
    x.due();
    await x.service.process('request');
    expect(x.state.request.status).toBe('CANCELLED');
    expect(x.state.transactions).toEqual([]);
  });

  it.each([
    [600000, 15.75],
    [86400000, 15.75],
    [86400001, 52.5],
  ])('captures only the cancellation fee at %i ms', async (elapsed, fee) => {
    const x = setup();
    await x.authorize();
    x.state.request.assignedDriverId = 'driver';
    x.state.request.status = 'DRIVER_GOING_TO_PICKUP';
    jest.setSystemTime(start.getTime() + elapsed);
    const result = await x.service.cancel('customer', 'request', false, {
      expectedRetainedAmount: fee,
      policyVersion: PAYMENT_POLICY_VERSION,
    });
    expect(result).toMatchObject({
      retainedAmount: fee,
      releasedAmount: 105 - fee,
      refundedAmount: 0,
    });
    expect(x.state.wallet.balance.toNumber()).toBe(200 - fee);
    expect(x.state.wallet.reservedBalance.toNumber()).toBe(0);
    await x.service.cancel('customer', 'request');
    expect(x.state.wallet.balance.toNumber()).toBe(200 - fee);
  });

  it('releases an authorized payment for free if the job has not yet been assigned', async () => {
    const x = setup();
    await x.authorize();
    const result = await x.service.cancel('customer', 'request');
    expect(result.retainedAmount).toBe(0);
    expect(x.state.wallet.balance.toNumber()).toBe(200);
    expect(x.state.wallet.reservedBalance.toNumber()).toBe(0);
  });

  it('persists an unconfirmed Stripe intent before authorization and never captures it at acceptance', async () => {
    const x = setup('CREDIT_CARD');
    await x.stage();
    x.due();
    await x.service.process('request');
    expect(x.stripe.confirmManualAuthorization).not.toHaveBeenCalled();
    await x.service.process('request');
    expect(x.state.hold.status).toBe('PAYMENT_HELD');
    expect(x.state.hold.authorizationExpiresAt).toBeInstanceOf(Date);
    expect(x.stripe.captureAuthorization).not.toHaveBeenCalled();
  });

  it('recovers a successful bank authorization after a lost response without authorizing twice', async () => {
    const x = setup('CREDIT_CARD');
    await x.stage();
    x.due();
    await x.service.process('request');
    x.stripe.confirmManualAuthorization.mockImplementationOnce(
      async (id: string) => {
        x.intents.get(id).status = 'requires_capture';
        throw new ServiceUnavailableException('Lost response');
      },
    );
    await expect(x.service.process('request')).rejects.toThrow('Lost response');
    await x.service.process('request');
    expect(x.state.hold.status).toBe('PAYMENT_HELD');
    expect(x.stripe.confirmManualAuthorization).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'handles bank authentication success or timeout (%s)',
    async (success) => {
      const x = setup('CREDIT_CARD');
      await x.stage();
      x.due();
      await x.service.process('request');
      x.stripe.confirmManualAuthorization.mockImplementationOnce(
        async (id: string) => {
          x.intents.get(id).status = 'requires_action';
          return x.intents.get(id);
        },
      );
      await x.service.process('request');
      expect(x.state.hold.confirmationState).toBe('ACTION_REQUIRED');
      expect(x.state.hold.approvalDeadlineAt.getTime()).toBe(
        Date.now() + BANK_APPROVAL_MS,
      );
      expect(x.state.request.assignedDriverId).toBeNull();
      if (success)
        x.intents.get(x.state.hold.stripePaymentIntentId as string).status =
          'requires_capture';
      else jest.setSystemTime(Date.now() + BANK_APPROVAL_MS);
      await x.service.process('request');
      expect(x.state.hold.confirmationState).toBe(
        success ? 'CONFIRMED' : 'CANCELLED',
      );
      expect(x.stripe.captureAuthorization).not.toHaveBeenCalled();
    },
  );

  it('cannot authorize or assign after cancellation of an in-flight unconfirmed intent', async () => {
    const x = setup('CREDIT_CARD');
    await x.stage();
    x.due();
    await x.service.process('request');
    await x.service.cancel('customer', 'request');
    await x.service.process('request');
    expect(x.stripe.confirmManualAuthorization).not.toHaveBeenCalled();
    expect(x.state.request.status).toBe('CANCELLED');
  });

  it('requires client-confirmed delivery, then captures wallet reservations once', async () => {
    const x = setup();
    await x.authorize();
    x.state.request.status = 'DELIVERED';
    await expect(
      x.service.captureDelivery('customer', 'request'),
    ).rejects.toThrow('Client-confirmed');
    x.state.request.deliveryConfirmedByCustomerAt = new Date();
    await x.service.captureDelivery('customer', 'request');
    await x.service.captureDelivery('customer', 'request');
    expect(x.state.wallet.balance.toNumber()).toBe(95);
    expect(x.state.wallet.reservedBalance.toNumber()).toBe(0);
    expect(x.state.settlement.status).toBe('COLLECTED');
    expect(x.state.hold.status).toBe('PAYMENT_CAPTURED');
  });

  it('recovers a Stripe cancellation-fee capture after a DB rollback without charging twice', async () => {
    const x = setup('CREDIT_CARD');
    await x.authorize();
    x.state.request.assignedDriverId = 'driver';
    // Commit the operation, then simulate loss of the commit following Stripe capture.
    x.state.hold.operationKind = 'CANCEL';
    x.state.hold.operationAmount = D(15.75);
    x.state.hold.confirmationState = 'CANCELLING';
    x.loseCommit();
    await expect(x.service.process('request')).rejects.toThrow(
      'Database connection lost',
    );
    await x.service.process('request');
    expect(x.stripe.captureAuthorization).toHaveBeenCalledTimes(1);
    expect(x.stripe.captureAuthorization).toHaveBeenCalledWith(
      expect.any(String),
      1575,
      'booking_CANCEL_hold',
    );
    expect(x.state.request.status).toBe('CANCELLED');
    expect(x.state.request.capturedAmount.toNumber()).toBe(15.75);
  });

  it('retries failed customer alerts and allows a new bank-approval alert during renewal', async () => {
    const x = setup('CREDIT_CARD');
    await x.authorize();
    x.state.hold.confirmationState = 'ACTION_REQUIRED';
    x.notifications.notifyCustomerTripUpdate.mockRejectedValueOnce(
      new Error('Push unavailable'),
    );
    await expect(x.service.notifyState('request')).rejects.toThrow(
      'Push unavailable',
    );
    expect(x.state.hold.confirmationNotifiedState).not.toBe('ACTION_REQUIRED');
    await x.service.notifyState('request');
    await x.service.notifyState('request');
    expect(x.notifications.notifyCustomerTripUpdate).toHaveBeenCalledTimes(2);
    x.state.hold.confirmationState = 'CONFIRMED';
    jest.setSystemTime(x.state.hold.authorizationExpiresAt.getTime() - 60000);
    await x.service.process('request');
    expect(x.state.hold.confirmationNotifiedState).toBeNull();
    x.state.hold.confirmationState = 'ACTION_REQUIRED';
    await x.service.notifyState('request');
    expect(x.notifications.notifyCustomerTripUpdate).toHaveBeenCalledTimes(3);
  });

  it('replaces an expiring hold before releasing the original', async () => {
    const x = setup('CREDIT_CARD');
    await x.authorize();
    const oldId = x.state.hold.stripePaymentIntentId as string;
    jest.setSystemTime(x.state.hold.authorizationExpiresAt.getTime() - 60000);
    await x.service.process('request');
    await x.service.process('request');
    expect(x.intents.get(oldId).status).toBe('requires_capture');
    await x.service.process('request');
    expect(x.intents.get(oldId).status).toBe('canceled');
    expect(x.state.hold.confirmationState).toBe('CONFIRMED');
  });

  it.each([false, true])(
    'renewal decline cancels before pickup or flags manual review after pickup (%s)',
    async (afterPickup) => {
      const x = setup('CREDIT_CARD');
      await x.authorize();
      x.state.request.assignedDriverId = 'driver';
      if (afterPickup) {
        x.state.request.itemPickedUpAt = new Date();
        x.state.request.status = 'ITEM_PICKED_UP';
      }
      jest.setSystemTime(x.state.hold.authorizationExpiresAt.getTime() - 60000);
      await x.service.process('request');
      await x.service.process('request');
      x.stripe.confirmManualAuthorization.mockImplementationOnce(
        async (id: string) => {
          x.intents.get(id).status = 'requires_payment_method';
          return x.intents.get(id);
        },
      );
      await x.service.process('request');
      expect(x.state.hold.confirmationState).toBe(
        afterPickup ? 'MANUAL_REVIEW' : 'CANCELLED',
      );
      expect(x.stripe.captureAuthorization).not.toHaveBeenCalled();
      if (afterPickup)
        expect(x.state.settlement.requiresManualReview).toBe(true);
    },
  );

  it('preserves delivery earning shares and payout eligibility when funds are captured', async () => {
    const x = setup();
    await x.authorize();
    x.state.request.status = 'DELIVERED';
    x.state.request.deliveryConfirmedByCustomerAt = new Date();
    Object.assign(x.state.settlement, {
      driverShareAmount: D(90),
      platformShareAmount: D(15),
      driverPayoutState: 'EARNING_CREATED',
    });
    await x.service.captureDelivery('customer', 'request');
    expect(x.state.settlement.driverShareAmount.toNumber()).toBe(90);
    expect(x.state.settlement.platformShareAmount.toNumber()).toBe(15);
    expect(x.state.settlement.driverPayoutState).toBe('EARNING_CREATED');
  });

  it('flags cancellation after pickup for review without releasing held funds', async () => {
    const x = setup();
    await x.authorize();
    x.state.request.itemPickedUpAt = new Date();
    await expect(x.service.cancel('customer', 'request')).rejects.toThrow(
      'manual review',
    );
    expect(x.state.settlement.requiresManualReview).toBe(true);
    expect(x.state.wallet.reservedBalance.toNumber()).toBe(105);
  });

  it('cancels an explicit authentication failure without charging', async () => {
    const x = setup('CREDIT_CARD');
    await x.stage();
    x.due();
    await x.service.process('request');
    x.intents.get(x.state.hold.stripePaymentIntentId as string).status =
      'requires_action';
    await x.service.process('request');
    await x.service.failApproval('customer', 'request');
    expect(x.state.request.status).toBe('CANCELLED');
    expect(x.stripe.captureAuthorization).not.toHaveBeenCalled();
  });

  it('cancels for free when the selected offer is withdrawn before authorization', async () => {
    const x = setup();
    await x.stage();
    x.due();
    x.db.driverOffer.findUnique.mockResolvedValue({ status: 'CANCELLED' });
    await x.service.process('request');
    expect(x.state.request.status).toBe('CANCELLED');
    expect(x.state.transactions).toEqual([]);
  });

  it('does not recompute an already persisted cancellation fee on a later retry', async () => {
    const x = setup('CREDIT_CARD');
    await x.authorize();
    x.state.request.assignedDriverId = 'driver';
    x.state.hold.operationKind = 'CANCEL';
    x.state.hold.operationAmount = D(15.75);
    x.state.hold.confirmationState = 'CANCELLING';
    jest.setSystemTime(start.getTime() + 86400001);
    const result = await x.service.cancel('customer', 'request');
    expect(result.retainedAmount).toBe(15.75);
  });

  it('does not extend the original deferred reservation deadline for the countdown', async () => {
    const x = setup();
    await x.stage();
    x.state.request.status = 'RESERVED';
    x.state.request.deferredPaymentState = 'PAYMENT_PENDING';
    x.state.request.paymentDeadlineAt = new Date(start.getTime() + 300000);
    jest.setSystemTime(start.getTime() + 300000);
    await x.service.process('request');
    expect(x.state.request.status).toBe('CANCELLED');
    expect(x.state.request.deferredPaymentState).toBe('CANCELLED');
    expect(x.state.wallet.reservedBalance.toNumber()).toBe(0);
  });

  it('releases funds if an offer is withdrawn after authorization but before assignment', async () => {
    const x = setup();
    await x.authorize();
    x.db.driverOffer.findUnique.mockResolvedValue({ status: 'CANCELLED' });
    await x.service.process('request');
    expect(x.state.request.status).toBe('CANCELLED');
    expect(x.state.wallet.reservedBalance.toNumber()).toBe(0);
    expect(x.state.wallet.balance.toNumber()).toBe(200);
  });

  it('recovers renewal if releasing the old authorization succeeded before a DB rollback', async () => {
    const x = setup('CREDIT_CARD');
    await x.authorize();
    const oldId = x.state.hold.stripePaymentIntentId as string;
    jest.setSystemTime(x.state.hold.authorizationExpiresAt.getTime() - 60000);
    await x.service.process('request');
    await x.service.process('request');
    x.loseCommit();
    await expect(x.service.process('request')).rejects.toThrow(
      'Database connection lost',
    );
    expect(x.intents.get(oldId).status).toBe('canceled');
    await x.service.process('request');
    expect(x.state.hold.confirmationState).toBe('CONFIRMED');
  });

  it('rejects a stale cancellation quote without charging a higher fee', async () => {
    const x = setup();
    await x.authorize();
    x.state.request.assignedDriverId = 'driver';
    jest.setSystemTime(start.getTime() + 86400001);
    await expect(
      x.service.cancel('customer', 'request', false, {
        expectedRetainedAmount: 15.75,
        policyVersion: PAYMENT_POLICY_VERSION,
      }),
    ).rejects.toThrow('fee changed');
    expect(x.state.wallet.balance.toNumber()).toBe(200);
    expect(x.state.wallet.reservedBalance.toNumber()).toBe(105);
    expect(x.state.hold.operationKind).toBeUndefined();
  });

  it('cancels an initially declined bank authorization without a capture', async () => {
    const x = setup('CREDIT_CARD');
    await x.stage();
    x.due();
    await x.service.process('request');
    x.stripe.confirmManualAuthorization.mockImplementationOnce(
      async (id: string) => {
        x.intents.get(id).status = 'requires_payment_method';
        return x.intents.get(id);
      },
    );
    await x.service.process('request');
    expect(x.state.request.status).toBe('CANCELLED');
    expect(x.stripe.captureAuthorization).not.toHaveBeenCalled();
  });

  it('releases an externally cancelled request once, even when its original hold was confirmed', async () => {
    const x = setup();
    await x.authorize();
    x.state.request.status = 'CANCELLED';
    await x.service.process('request');
    await x.service.process('request');
    expect(x.state.wallet.reservedBalance.toNumber()).toBe(0);
    expect(x.state.hold.status).toBe('PAYMENT_RELEASED');
    expect(x.state.hold.confirmationState).toBe('CANCELLED');
    expect(
      x.state.transactions.filter((t: any) => t.type === 'RELEASE'),
    ).toHaveLength(1);
  });

  it('exposes the policy durations used by the implemented countdown and bank approval', () => {
    expect(paymentPolicy(true).booking).toMatchObject({
      freeCancellationSeconds: 600,
      bankApprovalSeconds: 300,
      capture: 'CUSTOMER_CONFIRMS_DELIVERY',
    });
  });
});
