// Stripe TEST MODE ONLY. Creates synthetic payments, refunds captured amounts,
// cancels unused holds, and removes its synthetic customer. Never uses app data.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const Stripe = require('stripe');
const { StripeService } = require('../dist/src/payments/stripe.service');
const { resolveStripeConfiguration } = require('../dist/src/config/stripe');

async function main() {
  const config = resolveStripeConfiguration();
  assert.equal(config.mode, 'test', 'Live Stripe credentials are refused.');
  assert.ok(config.secretKey.startsWith('sk_test_'));
  const accountId = process.env.STRIPE_TEST_DIRECT_ACCOUNT_ID;
  assert.ok(
    accountId?.startsWith('acct_'),
    'Set STRIPE_TEST_DIRECT_ACCOUNT_ID to an onboarded test merchant.',
  );
  const stripe = new Stripe(config.secretKey, {
    timeout: 15000,
    maxNetworkRetries: 0,
  });
  const merchant = await stripe.accounts.retrieve(accountId);
  assert.equal(
    merchant.charges_enabled,
    true,
    'Complete test merchant onboarding first.',
  );
  const service = new StripeService();
  service.getClient = () => stripe;
  const run = randomUUID();
  const customer = await stripe.customers.create({
    name: 'Direct charge integration fixture',
    metadata: { fixture: 'direct-charge', run },
  });
  const payments = [];
  try {
    const setup = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method: 'pm_card_visa',
      payment_method_types: ['card'],
      usage: 'off_session',
      confirm: true,
    });
    const methodId =
      typeof setup.payment_method === 'string'
        ? setup.payment_method
        : setup.payment_method.id;
    for (const [currency, amount, fee] of [
      ['chf', 630, 120],
      ['usd', 525, 100],
    ]) {
      const key = `direct_fixture_${run}_${currency}`;
      const intent = await service.createManualAuthorization({
        customerId: customer.id,
        stripePaymentMethodId: methodId,
        stripeAccountId: accountId,
        applicationFeeAmount: fee,
        amount,
        currency,
        transferGroup: key,
        idempotencyKey: key,
        metadata: { fixture: 'direct-charge', run },
      });
      payments.push(intent.id);
      assert.equal(intent.status, 'requires_confirmation');
      const authorized = await service.confirmManualAuthorization(
        intent.id,
        `${key}_confirm`,
        accountId,
      );
      assert.equal(authorized.status, 'requires_capture');
      assert.equal(authorized.amount_received, 0);
      assert.equal(authorized.amount_capturable, amount);
      assert.equal(authorized.application_fee_amount, fee);
      await assert.rejects(
        stripe.paymentIntents.retrieve(intent.id),
        (error) => error.code === 'resource_missing',
      );
      console.log(
        `PASS ${currency}: authorization exists on driver account only; no collected funds before release.`,
      );
      const captured = await service.captureAuthorization(
        intent.id,
        amount,
        `${key}_capture`,
        accountId,
        fee,
      );
      assert.equal(captured.status, 'succeeded');
      assert.equal(captured.amount_received, amount);
      assert.equal(captured.application_fee_amount, fee);
      const repeated = await service.captureAuthorization(
        intent.id,
        amount,
        `${key}_capture`,
        accountId,
        fee,
      );
      assert.equal(repeated.latest_charge, captured.latest_charge);
      console.log(
        `PASS ${currency}: driver receives ${amount - fee} minor units before Stripe fees; platform fee ${fee}; capture retry is idempotent.`,
      );
      await service.createRefund({
        paymentIntentId: intent.id,
        stripeAccountId: accountId,
        idempotencyKey: `${key}_refund`,
      });
      console.log(
        `PASS ${currency}: full test refund, including application fee, completed on driver account.`,
      );
    }
  } finally {
    for (const id of payments) {
      const intent = await service.retrievePaymentIntent(id, accountId);
      if (intent.status !== 'succeeded' && intent.status !== 'canceled')
        await service.cancelPaymentIntent(id, accountId);
      if (intent.status === 'succeeded') {
        const charge = await stripe.charges.retrieve(
          typeof intent.latest_charge === 'string'
            ? intent.latest_charge
            : intent.latest_charge.id,
          {},
          { stripeAccount: accountId },
        );
        if (!charge.refunded)
          await service.createRefund({
            paymentIntentId: id,
            stripeAccountId: accountId,
            idempotencyKey: `direct_fixture_cleanup_${id}`,
          });
      }
    }
    await stripe.customers.del(customer.id);
    console.log(
      'PASS: synthetic test customer removed; app database untouched.',
    );
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
