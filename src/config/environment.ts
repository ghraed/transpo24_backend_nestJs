const REQUIRED_TWILIO_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_VERIFY_SERVICE_SID',
] as const;

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_TWILIO_KEYS.filter((key) => {
    const value = environment[key];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  return environment;
}
