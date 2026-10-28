// Uses only Stripe test mode. Does not touch the application database or real bookings.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const Stripe = require('stripe');
const { StripeService } = require('../dist/src/payments/stripe.service');

async function main() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key.startsWith('sk_test_')) throw new Error('A Stripe test secret key is required; live mode is refused.');
  const stripe = new Stripe(key, { maxNetworkRetries: 1, timeout: 15000 });
  const service = new StripeService();
  const run = randomUUID();
  const customer = await stripe.customers.create({ name: 'Delayed booking integration fixture', metadata: { fixture: 'delayed-booking', run } });
  const intents = [];
  let sequence = 0;
  const create = async paymentMethodId => {
    const intent = await service.createManualAuthorization({ customerId: customer.id, stripePaymentMethodId: paymentMethodId, amount: 10500, currency: 'chf', idempotencyKey: `${run}-${sequence++}`, transferGroup: `fixture_${run}`, metadata: { fixture: 'delayed-booking', run } });
    intents.push(intent.id);
    assert.equal(intent.status, 'requires_confirmation');
    assert.equal(intent.amount_capturable, 0);
    return intent;
  };
  try {
    const setup = await stripe.setupIntents.create({ customer: customer.id, payment_method: 'pm_card_visa', payment_method_types: ['card'], usage: 'off_session', confirm: true });
    assert.equal(setup.status, 'succeeded');
    const cardId = typeof setup.payment_method === 'string' ? setup.payment_method : setup.payment_method.id;
    assert.equal((await stripe.paymentIntents.list({ customer: customer.id })).data.length, 0, 'Saving a card must not create a booking payment.');
    console.log('PASS: card setup creates no booking payment or hold');

    const released = await create(cardId);
    const held = await service.confirmManualAuthorization(released.id, `${run}-release-confirm`);
    assert.equal(held.status, 'requires_capture');
    assert.equal(held.amount_capturable, 10500);
    assert.equal(held.amount_received, 0);
    assert.ok(held.latest_charge.payment_method_details.card.capture_before);
    assert.equal((await service.cancelPaymentIntent(released.id)).status, 'canceled');
    console.log('PASS: authorize full amount, expose actual expiry, release without capture');

    const partial = await create(cardId);
    await service.confirmManualAuthorization(partial.id, `${run}-partial-confirm`);
    const fee = await service.captureAuthorization(partial.id, 1575, `${run}-partial-capture`);
    assert.equal(fee.status, 'succeeded'); assert.equal(fee.amount_received, 1575); assert.equal(fee.amount_capturable, 0);
    const repeated = await service.captureAuthorization(partial.id, 1575, `${run}-partial-capture`);
    assert.equal(repeated.latest_charge, fee.latest_charge);
    console.log('PASS: capture only the 15% fee, release remainder, retry without duplicate charge');

    const delivery = await create(cardId);
    await service.confirmManualAuthorization(delivery.id, `${run}-delivery-confirm`);
    const captured = await service.captureAuthorization(delivery.id, 10500, `${run}-delivery-capture`);
    assert.equal(captured.status, 'succeeded'); assert.equal(captured.amount_received, 10500);
    console.log('PASS: full capture of the authorized booking amount');

    const extra = await service.prepareAdditionalExpense({ customerId: customer.id, amount: 2100, currency: 'chf', additionalChargeId: `fixture_${run}` });
    intents.push(extra.id);
    assert.equal(extra.amount_received, 0);
    const extraAgain = await service.prepareAdditionalExpense({ customerId: customer.id, amount: 2100, currency: 'chf', additionalChargeId: `fixture_${run}` });
    assert.equal(extraAgain.id, extra.id);
    const extraPaid = await service.confirmAdditionalExpense(extra.id, cardId);
    assert.equal(extraPaid.status, 'succeeded'); assert.equal(extraPaid.amount_received, 2100);
    assert.equal((await service.retrievePaymentIntent(extra.id)).status, 'succeeded');
    console.log('PASS: an additional expense has one durable intent and charges immediately on confirmation');

    for (const [fixture, expected] of [['pm_card_chargeCustomerFail', 'requires_payment_method'], ['pm_card_authenticationRequired', 'requires_action']]) {
      const card = await stripe.paymentMethods.attach(fixture, { customer: customer.id });
      const intent = await create(card.id);
      const result = await service.confirmManualAuthorization(intent.id, `${run}-${expected}`);
      if (result.status !== expected) console.log(JSON.stringify({ expected, status: result.status, code: result.last_payment_error?.code, declineCode: result.last_payment_error?.decline_code, hasPaymentMethod: Boolean(result.payment_method), hasErrorPaymentMethod: Boolean(result.last_payment_error?.payment_method) }));
      assert.equal(result.status, expected);
      assert.equal(result.amount_received, 0);
      console.log(`PASS: bank outcome ${expected} is returned without capture`);
    }
  } finally {
    for (const id of intents) {
      const intent = await stripe.paymentIntents.retrieve(id);
      if (intent.status === 'succeeded') await stripe.refunds.create({ payment_intent: id });
      else if (intent.status !== 'canceled') await stripe.paymentIntents.cancel(id);
    }
    await stripe.customers.del(customer.id);
    console.log('Stripe test fixtures cleaned up.');
  }
}
main().catch(error => { console.error(String(error.message).replace(/(?:sk|pk)_(?:test|live)_[^\s]+/g, '[redacted]')); process.exitCode = 1; });
