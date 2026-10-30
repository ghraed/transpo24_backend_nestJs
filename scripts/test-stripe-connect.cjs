// Creates and closes one synthetic Stripe test account. No app database or payments.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const Stripe = require('stripe');
const { StripeService } = require('../dist/src/payments/stripe.service');
const { resolveStripeConfiguration } = require('../dist/src/config/stripe');

async function main() {
  const { mode, secretKey } = resolveStripeConfiguration();
  assert.equal(mode, 'test', 'This check refuses live credentials.');
  assert.ok(secretKey.startsWith('sk_test_'));
  const stripe = new Stripe(secretKey, {
    timeout: 15000,
    maxNetworkRetries: 0,
  });
  const service = new StripeService();
  service.getClient = () => stripe;
  const options = { apiVersion: '2026-10-28.preview' };
  let accountId;
  try {
    const platform = await stripe.accounts.retrieve();
    const account = await service.createExpressAccount({
      driverId: `connect-smoke-${randomUUID()}`,
      email: 'connect-smoke@example.com',
      name: 'Transpo24 Connect test fixture',
      country: platform.country,
    });
    accountId = account.id;
    assert.equal(account.accountApi, 'v2');
    const details = await stripe.v2.core.accounts.retrieve(
      accountId,
      {
        include: ['defaults', 'configuration.merchant'],
      },
      options,
    );
    assert.equal(details.livemode, false);
    assert.equal(details.dashboard, 'express');
    assert.equal(details.defaults.responsibilities.losses_collector, 'stripe');
    assert.equal(details.defaults.responsibilities.fees_collector, 'stripe');
    assert.ok(details.configuration.merchant);
    console.log(
      'PASS: test Express merchant created with Stripe-managed losses and fees.',
    );

    const base =
      process.env.DRIVER_APP_BASE_URL?.trim() || 'https://driver.transpo24.com';
    const link = await service.createAccountLink({
      accountId,
      refreshUrl: `${base}/stripe-connect?refresh=1`,
      returnUrl: `${base}/stripe-connect?return=1`,
    });
    assert.equal(new URL(link.url).protocol, 'https:');
    // Do not print the single-use onboarding URL.
    console.log('PASS: Stripe-hosted merchant onboarding link created.');
    const status = await service.retrieveAccount(accountId);
    assert.equal(status.id, accountId);
    assert.equal(status.payouts_enabled, false);
    console.log('PASS: incomplete onboarding stays unavailable for payouts.');
  } finally {
    if (accountId) {
      await stripe.v2.core.accounts.close(
        accountId,
        { applied_configurations: ['merchant'] },
        options,
      );
      console.log('PASS: synthetic test account closed.');
    }
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      message: error.message,
      code: error.code,
      requestId: error.requestId,
    }),
  );
  process.exitCode = 1;
});
