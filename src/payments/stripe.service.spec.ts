import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { StripeService } from './stripe.service';

describe('StripeService', () => {
  it('forces card-only confirmation when a Stripe payment method id is supplied', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'pi_test' });
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

    await service.createManualCaptureIntent({
      customerId: 'cus_test',
      amount: 15000,
      currency: 'usd',
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

  it('maps Stripe invalid request failures to BadRequestException', async () => {
    const create = jest.fn().mockRejectedValue({
      type: 'StripeInvalidRequestError',
      message: 'No such payment_method: pm_missing',
    });
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

    await expect(
      service.createManualCaptureIntent({
        customerId: 'cus_test',
        amount: 15000,
        currency: 'usd',
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
