import { resolveStripeConfiguration } from './stripe';

describe('Stripe credential selection', () => {
  it.each(['test', 'live'])(
    'selects the %s key and webhook together',
    (mode) => {
      expect(
        resolveStripeConfiguration({
          STRIPE_MODE: mode,
          STRIPE_TEST_SECRET_KEY: 'sk_test_owner',
          STRIPE_TEST_WEBHOOK_SECRET: 'whsec_test_endpoint',
          STRIPE_LIVE_SECRET_KEY: 'sk_live_owner',
          STRIPE_LIVE_WEBHOOK_SECRET: 'whsec_live_endpoint',
          STRIPE_SECRET_KEY: 'sk_live_legacy',
          STRIPE_WEBHOOK_SECRET: 'whsec_legacy',
        }),
      ).toEqual({
        mode,
        secretKey: `sk_${mode}_owner`,
        webhookSecret: `whsec_${mode}_endpoint`,
      });
    },
  );

  it.each(['', 'sk_live_wrong_mode'])(
    'never falls back to live credentials: %s',
    (testKey) => {
      expect(() =>
        resolveStripeConfiguration({
          STRIPE_MODE: 'test',
          STRIPE_TEST_SECRET_KEY: testKey,
          STRIPE_SECRET_KEY: 'sk_live_legacy',
        }),
      ).toThrow('STRIPE_TEST_SECRET_KEY');
    },
  );

  it('rejects unknown modes', () => {
    expect(() =>
      resolveStripeConfiguration({ STRIPE_MODE: 'testing' }),
    ).toThrow('STRIPE_MODE must be test or live');
  });

  it('retains legacy configuration when mode is unset', () => {
    expect(
      resolveStripeConfiguration({
        STRIPE_SECRET_KEY: 'sk_test_local',
        STRIPE_WEBHOOK_SECRET: 'whsec_local',
      }),
    ).toEqual({
      mode: 'test',
      secretKey: 'sk_test_local',
      webhookSecret: 'whsec_local',
    });
  });
});
