export function resolveStripeConfiguration(
  environment: Record<string, unknown> = process.env,
): {
  mode: 'test' | 'live' | null;
  secretKey: string;
  webhookSecret: string;
} {
  const read = (key: string): string =>
    typeof environment[key] === 'string' ? environment[key].trim() : '';
  const selectedMode = read('STRIPE_MODE');
  if (selectedMode && selectedMode !== 'test' && selectedMode !== 'live') {
    throw new Error('STRIPE_MODE must be test or live.');
  }

  const secretVariable = selectedMode
    ? `STRIPE_${selectedMode.toUpperCase()}_SECRET_KEY`
    : 'STRIPE_SECRET_KEY';
  const webhookVariable = selectedMode
    ? `STRIPE_${selectedMode.toUpperCase()}_WEBHOOK_SECRET`
    : 'STRIPE_WEBHOOK_SECRET';
  const secretKey = read(secretVariable);
  const webhookSecret = read(webhookVariable);
  // Explicit selection must never use legacy credentials or the opposite mode.
  if (selectedMode && !secretKey.startsWith(`sk_${selectedMode}_`)) {
    throw new Error(
      `${secretVariable} must be a Stripe ${selectedMode}-mode secret (sk_${selectedMode}_...).`,
    );
  }
  const mode = secretKey.startsWith('sk_test_')
    ? 'test'
    : secretKey.startsWith('sk_live_')
      ? 'live'
      : null;
  return { mode, secretKey, webhookSecret };
}
