import Stripe from 'stripe';
import { BadRequestException } from '@nestjs/common';
import { StripeService } from './stripe.service';

describe('Stripe mode and signed webhooks', () => {
  const originalEnvironment = process.env;
  const signingSecret = 'whsec_deployed_test';
  const signer = new Stripe('sk_test_unit');

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it.each(['test', 'live'] as const)(
    'accepts only %s webhooks when that mode is selected',
    (mode) => {
      process.env = {
        ...originalEnvironment,
        STRIPE_MODE: mode,
        STRIPE_TEST_SECRET_KEY: 'sk_test_unit',
        STRIPE_TEST_WEBHOOK_SECRET: signingSecret,
        STRIPE_LIVE_SECRET_KEY: 'sk_live_unit',
        STRIPE_LIVE_WEBHOOK_SECRET: signingSecret,
      };
      const service = new StripeService();
      expect(service.mode).toBe(mode);

      for (const livemode of [false, true]) {
        const payload = JSON.stringify({
          id: 'evt_unit',
          object: 'event',
          livemode,
          data: { object: {} },
        });
        const header = signer.webhooks.generateTestHeaderString({
          payload,
          secret: signingSecret,
        });
        const construct = () =>
          service.constructWebhookEvent(Buffer.from(payload), header);
        if (livemode === (mode === 'live')) {
          expect(construct()).toMatchObject({ livemode });
        } else {
          expect(construct).toThrow('Stripe webhook mode does not match');
        }
      }

      const payload = JSON.stringify({ livemode: mode === 'live' });
      const header = signer.webhooks.generateTestHeaderString({
        payload,
        secret: 'whsec_wrong_endpoint',
      });
      expect(() =>
        service.constructWebhookEvent(Buffer.from(payload), header),
      ).toThrow(BadRequestException);
    },
  );
});
