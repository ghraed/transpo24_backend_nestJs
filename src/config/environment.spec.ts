import { validateEnvironment } from './environment';

describe('validateEnvironment', () => {
  const configured = {
    DATABASE_URL: 'postgresql://localhost/transpo24_test',
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'secret',
    TWILIO_VERIFY_SERVICE_SID: 'VA_test',
  };

  it('accepts the required Twilio configuration', () => {
    expect(validateEnvironment(configured)).toBe(configured);
  });

  it('reports missing Twilio configuration without exposing values', () => {
    expect(() => validateEnvironment({})).toThrow(
      'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID',
    );
  });

  it('does not require a configurable Verify channel', () => {
    expect(validateEnvironment(configured)).toBe(configured);
  });

  it('accepts paired Google Play reviewer credentials', () => {
    const reviewConfigured = {
      ...configured,
      PLAY_REVIEW_PHONE_NUMBER: '+41791234567',
      PLAY_REVIEW_OTP_CODE: '583104',
    };

    expect(validateEnvironment(reviewConfigured)).toBe(reviewConfigured);
  });

  it('rejects incomplete or malformed Google Play reviewer credentials', () => {
    expect(() =>
      validateEnvironment({
        ...configured,
        PLAY_REVIEW_PHONE_NUMBER: '+41791234567',
      }),
    ).toThrow('must be configured together');

    expect(() =>
      validateEnvironment({
        ...configured,
        PLAY_REVIEW_PHONE_NUMBER: '0791234567',
        PLAY_REVIEW_OTP_CODE: '123456',
      }),
    ).toThrow('E.164');

    expect(() =>
      validateEnvironment({
        ...configured,
        PLAY_REVIEW_PHONE_NUMBER: '+41791234567',
        PLAY_REVIEW_OTP_CODE: '1234',
      }),
    ).toThrow('exactly six digits');
  });

  it('requires the database configuration', () => {
    const withoutDatabase: Record<string, unknown> = { ...configured };
    delete withoutDatabase.DATABASE_URL;

    expect(() => validateEnvironment(withoutDatabase)).toThrow('DATABASE_URL');
  });

  it('requires explicit production security settings', () => {
    expect(() =>
      validateEnvironment({ ...configured, NODE_ENV: 'production' }),
    ).toThrow(
      'ACCESS_TOKEN_SECRET, CORS_ORIGINS, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, DRIVER_APP_BASE_URL',
    );
  });

  it('rejects a weak production token secret', () => {
    expect(() =>
      validateEnvironment({
        ...configured,
        NODE_ENV: 'production',
        ACCESS_TOKEN_SECRET: 'short',
        CORS_ORIGINS: 'https://api.example.com',
        STRIPE_SECRET_KEY: 'sk_live_test',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
        DRIVER_APP_BASE_URL: 'https://driver.example.com',
      }),
    ).toThrow('at least 32 characters');
  });

  it.each(['*', 'not-a-url', 'https://app.example.com/path'])(
    'rejects unsafe production CORS origin %s',
    (CORS_ORIGINS) => {
      expect(() =>
        validateEnvironment({
          ...configured,
          NODE_ENV: 'production',
          ACCESS_TOKEN_SECRET: 'a-secure-random-production-secret-123456',
          CORS_ORIGINS,
          STRIPE_SECRET_KEY: 'sk_live_test',
          STRIPE_WEBHOOK_SECRET: 'whsec_test',
          DRIVER_APP_BASE_URL: 'https://driver.example.com',
        }),
      ).toThrow('explicit, comma-separated URL origins');
    },
  );

  it('accepts an explicit production configuration', () => {
    const production = {
      ...configured,
      NODE_ENV: 'production',
      ACCESS_TOKEN_SECRET: 'a-secure-random-production-secret-123456',
      CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
      STRIPE_SECRET_KEY: 'sk_live_test',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      DRIVER_APP_BASE_URL: 'https://driver.example.com',
    };

    expect(validateEnvironment(production)).toBe(production);
  });

  it('rejects non-live Stripe credentials in production', () => {
    expect(() =>
      validateEnvironment({
        ...configured,
        NODE_ENV: 'production',
        ACCESS_TOKEN_SECRET: 'a-secure-random-production-secret-123456',
        CORS_ORIGINS: 'https://app.example.com',
        STRIPE_SECRET_KEY: 'sk_test_not_for_production',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
        DRIVER_APP_BASE_URL: 'https://driver.example.com',
      }),
    ).toThrow('Stripe live-mode secret');
  });

  it('requires test Stripe credentials in staging', () => {
    const staging = {
      ...configured,
      NODE_ENV: 'staging',
      ACCESS_TOKEN_SECRET: 'a-secure-random-staging-secret-123456789',
      CORS_ORIGINS: 'https://api-staging.example.com',
      STRIPE_SECRET_KEY: 'sk_test_staging',
      STRIPE_WEBHOOK_SECRET: 'whsec_staging',
      DRIVER_APP_BASE_URL: 'https://driver-staging.example.com',
    };

    expect(validateEnvironment(staging)).toBe(staging);
    expect(() =>
      validateEnvironment({
        ...staging,
        STRIPE_SECRET_KEY: 'sk_live_not_allowed',
      }),
    ).toThrow('Stripe test-mode secret in staging');
  });

  it('requires an HTTPS driver application URL in production', () => {
    expect(() =>
      validateEnvironment({
        ...configured,
        NODE_ENV: 'production',
        ACCESS_TOKEN_SECRET: 'a-secure-random-production-secret-123456',
        CORS_ORIGINS: 'https://app.example.com',
        STRIPE_SECRET_KEY: 'sk_live_test',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
        DRIVER_APP_BASE_URL: 'http://localhost:8081',
      }),
    ).toThrow('must be an HTTPS URL');
  });
});
