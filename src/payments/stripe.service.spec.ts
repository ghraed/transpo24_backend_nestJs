import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { StripeService } from './stripe.service';

describe('StripeService', () => {
  const connectInput = {
    driverId: 'driver_1',
    email: 'driver@example.com',
    country: 'CH',
  };

  const previewOptions = { apiVersion: '2026-10-28.preview' };
  const coreAccount = {
    id: 'acct_driver',
    object: 'v2.core.account',
    dashboard: 'express',
    requirements: { entries: [] },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { status: 'active' },
          stripe_balance: { payouts: { status: 'active' } },
        },
      },
    },
  };
  const mockConnect = () => {
    const create = jest.fn().mockResolvedValue(coreAccount);
    const retrieve = jest.fn().mockResolvedValue(coreAccount);
    const createLink = jest
      .fn()
      .mockResolvedValue({ url: 'https://connect.stripe.com/setup' });
    const legacyRetrieve = jest.fn().mockResolvedValue({
      id: 'acct_legacy',
      details_submitted: true,
      payouts_enabled: true,
    });
    const legacyLink = jest
      .fn()
      .mockResolvedValue({ url: 'https://connect.stripe.com/legacy' });
    const loginLink = jest
      .fn()
      .mockResolvedValue({ url: 'https://connect.stripe.com/dashboard' });
    const service = new StripeService();
    Object.defineProperty(service, 'getClient', {
      value: () => ({
        v2: {
          core: {
            accounts: { create, retrieve },
            accountLinks: { create: createLink },
          },
        },
        rawRequest: createLink,
        accounts: { retrieve: legacyRetrieve, createLoginLink: loginLink },
        accountLinks: { create: legacyLink },
      }),
    });
    return {
      service,
      create,
      retrieve,
      createLink,
      legacyRetrieve,
      legacyLink,
      loginLink,
    };
  };

  it('creates an Express merchant with Stripe-managed losses and fees, using the scoped preview', async () => {
    const { service, create } = mockConnect();
    await expect(
      service.createExpressAccount({
        ...connectInput,
        name: ' Driver ',
        country: 'de',
      }),
    ).resolves.toEqual({
      id: 'acct_driver',
      accountApi: 'v2',
      details_submitted: true,
      payouts_enabled: true,
    });
    expect(create).toHaveBeenCalledWith(
      {
        contact_email: connectInput.email,
        display_name: 'Driver',
        identity: { country: 'DE' },
        dashboard: 'express',
        defaults: {
          responsibilities: {
            fees_collector: 'stripe',
            losses_collector: 'stripe',
          },
        },
        configuration: {
          merchant: { capabilities: { card_payments: { requested: true } } },
        },
        metadata: { driverId: connectInput.driverId },
        include: ['configuration.merchant', 'requirements'],
      },
      previewOptions,
    );
  });

  it('preserves Stripe validation errors and never falls back to platform liability', async () => {
    const { service, create } = mockConnect();
    create.mockRejectedValue({
      type: 'StripeInvalidRequestError',
      message: 'Invalid email address.',
    });
    await expect(service.createExpressAccount(connectInput)).rejects.toThrow(
      new BadRequestException('Invalid email address.'),
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('opens merchant onboarding with both return URLs', async () => {
    const { service, createLink, legacyLink } = mockConnect();
    const urls = {
      refreshUrl: 'https://driver.example/stripe-connect?refresh=1',
      returnUrl: 'https://driver.example/stripe-connect?return=1',
    };
    await service.createAccountLink({ accountId: 'acct_driver', ...urls });
    expect(createLink).toHaveBeenCalledWith(
      'POST',
      '/v2/core/account_links',
      {
        account: 'acct_driver',
        use_case: {
          type: 'account_onboarding',
          account_onboarding: {
            refresh_url: urls.refreshUrl,
            return_url: urls.returnUrl,
          },
        },
      },
      previewOptions,
    );
    expect(legacyLink).not.toHaveBeenCalled();
  });

  it.each([
    'v1_account_instead_of_v2_account',
    'account_not_yet_compatible_with_v2',
  ])('preserves older accounts and onboarding for %s', async (code) => {
    const { service, retrieve, legacyRetrieve, legacyLink, createLink } =
      mockConnect();
    retrieve.mockRejectedValue({
      type: 'StripeInvalidRequestError',
      code,
      message: 'Legacy account',
    });
    await expect(service.retrieveAccount('acct_legacy')).resolves.toEqual({
      id: 'acct_legacy',
      accountApi: 'v1',
      details_submitted: true,
      payouts_enabled: true,
    });
    await service.createAccountLink({
      accountId: 'acct_legacy',
      refreshUrl: 'https://driver.example/refresh',
      returnUrl: 'https://driver.example/return',
    });
    expect(legacyRetrieve).toHaveBeenCalledWith('acct_legacy');
    expect(legacyLink).toHaveBeenCalledWith({
      account: 'acct_legacy',
      type: 'account_onboarding',
      refresh_url: 'https://driver.example/refresh',
      return_url: 'https://driver.example/return',
    });
    expect(createLink).not.toHaveBeenCalled();
  });

  it('does not hide preview access or permission failures behind legacy account calls', async () => {
    const { service, retrieve, legacyRetrieve } = mockConnect();
    retrieve.mockRejectedValue({
      type: 'StripePermissionError',
      message: 'Preview unavailable',
    });
    await expect(service.retrieveAccount('acct_driver')).rejects.toThrow(
      'Preview unavailable',
    );
    expect(legacyRetrieve).not.toHaveBeenCalled();
  });

  it.each([
    {
      requirements: undefined,
      card: 'active',
      payouts: 'active',
      closed: false,
      submitted: false,
      ready: true,
    },
    {
      requirements: {
        entries: [
          {
            awaiting_action_from: 'user',
            minimum_deadline: { status: 'currently_due' },
          },
        ],
      },
      card: 'restricted',
      payouts: 'restricted',
      closed: false,
      submitted: false,
      ready: false,
    },
    {
      requirements: {
        entries: [
          {
            awaiting_action_from: 'stripe',
            minimum_deadline: { status: 'currently_due' },
          },
        ],
      },
      card: 'pending',
      payouts: 'active',
      closed: false,
      submitted: true,
      ready: false,
    },
    {
      requirements: {
        entries: [
          {
            awaiting_action_from: 'user',
            minimum_deadline: { status: 'eventually_due' },
          },
        ],
      },
      card: 'active',
      payouts: 'active',
      closed: false,
      submitted: true,
      ready: true,
    },
    {
      requirements: { entries: [] },
      card: 'active',
      payouts: 'restricted',
      closed: false,
      submitted: true,
      ready: false,
    },
    {
      requirements: { entries: [] },
      card: 'active',
      payouts: 'active',
      closed: true,
      submitted: false,
      ready: false,
    },
  ])(
    'maps V2 verification and payouts conservatively: %j',
    async ({ requirements, card, payouts, closed, submitted, ready }) => {
      const { service, retrieve } = mockConnect();
      retrieve.mockResolvedValue({
        ...coreAccount,
        requirements,
        closed,
        configuration: {
          merchant: {
            capabilities: {
              card_payments: { status: card },
              stripe_balance: { payouts: { status: payouts } },
            },
          },
        },
      });
      await expect(
        service.retrieveAccount('acct_driver'),
      ).resolves.toMatchObject({
        details_submitted: submitted,
        payouts_enabled: ready,
      });
    },
  );

  it('opens the Express dashboard using a login link rather than restarting onboarding', async () => {
    const { service, loginLink, createLink, legacyLink } = mockConnect();
    await expect(
      service.createExpressLoginLink('acct_driver'),
    ).resolves.toEqual({ url: 'https://connect.stripe.com/dashboard' });
    expect(loginLink).toHaveBeenCalledWith('acct_driver');
    expect(createLink).not.toHaveBeenCalled();
    expect(legacyLink).not.toHaveBeenCalled();
  });

  it('converts off-session authentication failure into SDK approval on the same intent', async () => {
    const confirm = jest
      .fn()
      .mockRejectedValueOnce({ payment_intent: { id: 'pi_auth' } })
      .mockResolvedValueOnce({ id: 'pi_auth', status: 'requires_action' });
    const retrieve = jest.fn().mockResolvedValue({
      id: 'pi_auth',
      status: 'requires_payment_method',
      payment_method: null,
      last_payment_error: {
        code: 'authentication_required',
        payment_method: { id: 'pm_saved' },
      },
    });
    const service = new StripeService();
    (service as any).getClient = () => ({
      paymentIntents: { confirm, retrieve },
    });
    await expect(
      service.confirmManualAuthorization('pi_auth', 'confirm-key'),
    ).resolves.toMatchObject({ status: 'requires_action' });
    expect(confirm).toHaveBeenLastCalledWith(
      'pi_auth',
      expect.objectContaining({
        payment_method: 'pm_saved',
        off_session: false,
        use_stripe_sdk: true,
      }),
      { idempotencyKey: 'confirm-key_authentication' },
    );
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it('creates an immediate-capture card intent when a Stripe payment method id is supplied', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'pi_test' });
    const service = new StripeService();

    (
      service as unknown as {
        getClient(): {
          paymentMethods: { retrieve: jest.Mock };
          paymentIntents: {
            create: typeof create;
          };
        };
      }
    ).getClient = () => ({
      paymentMethods: {
        retrieve: jest.fn().mockResolvedValue({
          id: 'pm_card_mastercard',
          type: 'card',
          customer: 'cus_test',
        }),
      },
      paymentIntents: {
        create,
      },
    });

    await service.createImmediateCaptureIntent({
      customerId: 'cus_test',
      amount: 15000,
      currency: 'usd',
      idempotencyKey: 'trip_payment_req_1_offer_1',
      transferGroup: 'trip_req_1',
      stripePaymentMethodId: 'pm_card_mastercard',
      metadata: {
        requestId: 'req_1',
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_test',
        payment_method: 'pm_card_mastercard',
        payment_method_types: ['card'],
        confirm: true,
        transfer_group: 'trip_req_1',
      }),
      expect.objectContaining({
        idempotencyKey: 'trip_payment_req_1_offer_1',
      }),
    );
    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        capture_method: 'manual',
      }),
    );
  });

  it('returns the customer default card summary when a default card exists', async () => {
    const retrieve = jest.fn().mockResolvedValue({
      id: 'cus_test',
      invoice_settings: {
        default_payment_method: {
          id: 'pm_saved',
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
            exp_month: 12,
            exp_year: 2030,
          },
        },
      },
    });
    const service = new StripeService();

    (
      service as unknown as {
        getClient(): {
          customers: {
            retrieve: typeof retrieve;
          };
        };
      }
    ).getClient = () => ({
      customers: {
        retrieve,
      },
    });

    await expect(
      service.getCustomerDefaultPaymentMethod('cus_test'),
    ).resolves.toEqual({
      id: 'pm_saved',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
    });
  });

  it('creates an off-session charge with the saved card', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'pi_saved' });
    const service = new StripeService();

    (
      service as unknown as {
        getClient(): {
          paymentIntents: {
            create: typeof create;
          };
        };
      }
    ).getClient = () => ({
      paymentIntents: {
        create,
      },
    });

    await service.createOffSessionCharge({
      customerId: 'cus_test',
      paymentMethodId: 'pm_saved',
      amount: 1250,
      currency: 'usd',
      metadata: { additionalChargeId: 'charge_1' },
      idempotencyKey: 'charge_1_1',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_test',
        payment_method: 'pm_saved',
        payment_method_types: ['card'],
        confirm: true,
        off_session: true,
      }),
      expect.objectContaining({
        idempotencyKey: 'charge_1_1',
      }),
    );
  });

  it('creates an idempotent transfer linked to the source charge', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'tr_test' });
    const service = new StripeService();

    (
      service as unknown as {
        getClient(): {
          transfers: {
            create: typeof create;
          };
        };
      }
    ).getClient = () => ({
      transfers: {
        create,
      },
    });

    await service.createTransfer({
      amount: 8500,
      currency: 'chf',
      destination: 'acct_driver',
      transferGroup: 'trip_req_1',
      idempotencyKey: 'driver_payout_earning_1',
      sourceTransaction: 'ch_trip_1',
      metadata: {
        tripId: 'req_1',
      },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 8500,
        destination: 'acct_driver',
        source_transaction: 'ch_trip_1',
        transfer_group: 'trip_req_1',
      }),
      expect.objectContaining({
        idempotencyKey: 'driver_payout_earning_1',
      }),
    );
  });

  it('maps Stripe invalid request failures to BadRequestException', async () => {
    const create = jest.fn().mockRejectedValue({
      type: 'StripeInvalidRequestError',
      message: 'No such payment_method: pm_missing',
    });
    const service = new StripeService();

    (
      service as unknown as {
        getClient(): {
          paymentMethods: { retrieve: typeof create };
          paymentIntents: {
            create: typeof create;
          };
        };
      }
    ).getClient = () => ({
      paymentMethods: { retrieve: create },
      paymentIntents: {
        create,
      },
    });

    await expect(
      service.createImmediateCaptureIntent({
        customerId: 'cus_test',
        amount: 15000,
        currency: 'usd',
        idempotencyKey: 'trip_payment_req_1_offer_1',
        transferGroup: 'trip_req_1',
        stripePaymentMethodId: 'pm_missing',
        metadata: {
          requestId: 'req_1',
        },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('maps Stripe connection failures to ServiceUnavailableException', async () => {
    const retrieve = jest.fn().mockRejectedValue({
      type: 'StripeConnectionError',
      message: 'Connection to Stripe failed.',
    });
    const service = new StripeService();

    (
      service as unknown as {
        getClient(): {
          paymentIntents: {
            retrieve: typeof retrieve;
          };
        };
      }
    ).getClient = () => ({
      paymentIntents: {
        retrieve,
      },
    });

    await expect(service.retrievePaymentIntent('pi_test')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('returns null when the Stripe payment intent no longer exists', async () => {
    const retrieve = jest.fn().mockRejectedValue({
      type: 'StripeInvalidRequestError',
      message: 'No such payment_intent: pi_missing',
    });
    const service = new StripeService();

    (
      service as unknown as {
        getClient(): {
          paymentIntents: {
            retrieve: typeof retrieve;
          };
        };
      }
    ).getClient = () => ({
      paymentIntents: {
        retrieve,
      },
    });

    await expect(
      service.retrievePaymentIntentIfExists('pi_missing'),
    ).resolves.toBeNull();
  });

  it('falls back to a generated Stripe customer name when profile name is blank', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'cus_created' });
    const service = new StripeService();

    (
      service as unknown as {
        getClient(): {
          customers: {
            create: typeof create;
          };
        };
      }
    ).getClient = () => ({
      customers: {
        create,
      },
    });

    await service.ensureCustomer({
      customerId: 'customer_123',
      email: 'customer@example.com',
      name: '   ',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'customer@example.com',
        name: 'Customer customer_123',
      }),
    );
  });

  it('recreates the Stripe customer when the stored customer id no longer exists', async () => {
    const retrieve = jest.fn().mockRejectedValue({
      type: 'StripeInvalidRequestError',
      message: 'No such customer: cus_missing',
    });
    const create = jest.fn().mockResolvedValue({ id: 'cus_recreated' });
    const service = new StripeService();

    (
      service as unknown as {
        getClient(): {
          customers: {
            retrieve: typeof retrieve;
            create: typeof create;
          };
        };
      }
    ).getClient = () => ({
      customers: {
        retrieve,
        create,
      },
    });

    await expect(
      service.ensureCustomer({
        customerId: 'customer_123',
        email: 'customer@example.com',
        name: 'Test Customer',
        stripeCustomerId: 'cus_missing',
      }),
    ).resolves.toBe('cus_recreated');

    expect(retrieve).toHaveBeenCalledWith('cus_missing');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'customer@example.com',
        name: 'Test Customer',
      }),
    );
  });
});
