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
});
