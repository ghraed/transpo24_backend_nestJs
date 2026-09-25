// Opt-in Stripe TEST objects only; never use real card details or a live key.
const assert = require('node:assert/strict');
const Stripe = require('stripe');

async function createStripeCompatibilityFixture() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  assert.ok(key.startsWith('sk_test_'), 'M13 requires a Stripe test-mode key');
  const stripe = new Stripe(key, { timeout: 15000, maxNetworkRetries: 0 });
  let account, customer;
  async function cleanup(requestIds = []) {
    for (const id of requestIds) {
      for await (const transfer of stripe.transfers.list({
        transfer_group: `trip_${id}`,
        limit: 100,
      })) {
        assert.equal(transfer.livemode, false);
        if (!transfer.reversed)
          await stripe.transfers.createReversal(transfer.id);
      }
    }
    if (customer) {
      for await (const intent of stripe.paymentIntents.list({
        customer: customer.id,
        limit: 100,
      })) {
        assert.equal(intent.livemode, false);
        if (intent.status === 'succeeded') {
          const refunds = await stripe.refunds.list({
            payment_intent: intent.id,
          });
          if (!refunds.data.length)
            await stripe.refunds.create({ payment_intent: intent.id });
        } else if (!['canceled', 'processing'].includes(intent.status)) {
          await stripe.paymentIntents.cancel(intent.id);
        }
      }
      await stripe.customers.del(customer.id);
    }
    if (account) await stripe.accounts.del(account.id);
  }
  try {
    account = await stripe.accounts.create({
      type: 'custom',
      country: 'US',
      business_type: 'individual',
      capabilities: { transfers: { requested: true } },
      business_profile: {
        mcc: '4214',
        product_description: 'Synthetic M13 transport test',
      },
      individual: {
        first_name: 'M13',
        last_name: 'Fixture',
        email: 'm13@example.invalid',
        phone: '+12025550123',
        dob: { day: 1, month: 1, year: 1902 },
        id_number: '000000000',
        address: {
          line1: 'address_full_match',
          city: 'New York',
          state: 'NY',
          postal_code: '10001',
          country: 'US',
        },
      },
      tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
      external_account: 'btok_us_verified',
      metadata: { purpose: 'transpo24_m13_compatibility_test' },
    });
    assert.equal(
      account.payouts_enabled,
      true,
      'Test Connect fixture must have payouts enabled',
    );
    customer = await stripe.customers.create({
      name: 'M13 synthetic compatibility customer',
      metadata: { purpose: 'transpo24_m13_compatibility_test' },
    });
    assert.equal(customer.livemode, false);
    const method = await stripe.paymentMethods.create({
      type: 'card',
      card: { token: 'tok_visa' },
    });
    await stripe.paymentMethods.attach(method.id, { customer: customer.id });
    assert.equal(method.card.last4, '4242');
    return { stripe, account, customer, method, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
module.exports = { createStripeCompatibilityFixture };
