const REQUIRED_KEYS = [
  'DATABASE_URL',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_VERIFY_SERVICE_SID',
] as const;

const REQUIRED_DEPLOYMENT_KEYS = [
  'ACCESS_TOKEN_SECRET',
  'CORS_ORIGINS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'DRIVER_APP_BASE_URL',
] as const;

const INSECURE_SECRET_VALUES = new Set([
  'replace_with_a_long_random_secret',
  'transpo24-dev-access-token-secret',
]);

function isMissing(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const isProduction = environment.NODE_ENV === 'production';
  const isStaging = environment.NODE_ENV === 'staging';
  const isDeployedEnvironment = isProduction || isStaging;
  const requiredKeys = isDeployedEnvironment
    ? [...REQUIRED_KEYS, ...REQUIRED_DEPLOYMENT_KEYS]
    : REQUIRED_KEYS;
  const missing = requiredKeys.filter((key) => isMissing(environment[key]));

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const playReviewPhoneNumber = environment.PLAY_REVIEW_PHONE_NUMBER;
  const playReviewOtpCode = environment.PLAY_REVIEW_OTP_CODE;
  const hasPlayReviewPhoneNumber = !isMissing(playReviewPhoneNumber);
  const hasPlayReviewOtpCode = !isMissing(playReviewOtpCode);

  if (hasPlayReviewPhoneNumber !== hasPlayReviewOtpCode) {
    throw new Error(
      'PLAY_REVIEW_PHONE_NUMBER and PLAY_REVIEW_OTP_CODE must be configured together.',
    );
  }
  if (
    hasPlayReviewPhoneNumber &&
    !/^\+[1-9]\d{7,14}$/.test(String(playReviewPhoneNumber).trim())
  ) {
    throw new Error('PLAY_REVIEW_PHONE_NUMBER must use E.164 format.');
  }
  if (
    hasPlayReviewOtpCode &&
    !/^\d{6}$/.test(String(playReviewOtpCode).trim())
  ) {
    throw new Error('PLAY_REVIEW_OTP_CODE must contain exactly six digits.');
  }

  if (isDeployedEnvironment) {
    const accessTokenSecret = String(environment.ACCESS_TOKEN_SECRET);
    if (
      accessTokenSecret.length < 32 ||
      INSECURE_SECRET_VALUES.has(accessTokenSecret)
    ) {
      throw new Error(
        'ACCESS_TOKEN_SECRET must be a unique production secret of at least 32 characters.',
      );
    }

    const corsOrigins = String(environment.CORS_ORIGINS)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (
      corsOrigins.length === 0 ||
      corsOrigins.includes('*') ||
      corsOrigins.some((origin) => {
        try {
          return new URL(origin).origin !== origin;
        } catch {
          return true;
        }
      })
    ) {
      throw new Error(
        'CORS_ORIGINS must contain explicit, comma-separated URL origins in production.',
      );
    }

    const stripeSecretKey = String(environment.STRIPE_SECRET_KEY);
    if (isProduction && !stripeSecretKey.startsWith('sk_live_')) {
      throw new Error(
        'STRIPE_SECRET_KEY must be a Stripe live-mode secret in production.',
      );
    }
    if (isStaging && !stripeSecretKey.startsWith('sk_test_')) {
      throw new Error(
        'STRIPE_SECRET_KEY must be a Stripe test-mode secret in staging.',
      );
    }

    const stripeWebhookSecret = String(environment.STRIPE_WEBHOOK_SECRET);
    if (!stripeWebhookSecret.startsWith('whsec_')) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET must be a valid Stripe webhook signing secret in production.',
      );
    }

    try {
      const driverAppUrl = new URL(String(environment.DRIVER_APP_BASE_URL));
      if (driverAppUrl.protocol !== 'https:') {
        throw new Error('not HTTPS');
      }
    } catch {
      throw new Error(
        'DRIVER_APP_BASE_URL must be an HTTPS URL in production.',
      );
    }
  }

  return environment;
}
