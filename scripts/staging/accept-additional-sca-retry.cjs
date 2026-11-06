const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Stripe = require('stripe');
const { root, load } = require('./environment.cjs');
Object.assign(process.env, load());
const { PrismaService } = require('../../dist/src/prisma/prisma.service');
const db = new PrismaService();
const stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 0 });
const chargeId = 'cmw5dz3eh000o0ffvgjjp8kv2';
const output = path.join(root, 'docs/release-2026-11-05/evidence/nov06-additional-sca-retry.json');
let family;

async function snapshot() {
  const row = await db.additionalCharge.findUniqueOrThrow({ where: { id: chargeId } });
  const intent = await stripe.paymentIntents.retrieve(row.stripePaymentIntentId, {}, { stripeAccount: row.stripeAccountId });
  assert.equal(intent.livemode, false);
  const providerCharges = await stripe.charges.list({ payment_intent: intent.id, limit: 10 }, { stripeAccount: row.stripeAccountId });
  const ledger = await db.customerWalletTransaction.count({ where: { additionalChargeId: chargeId } });
  const earning = await db.driverEarning.findUnique({ where: { tripId: row.requestId } });
  return {
    dbStatus: row.status, intentId: row.stripePaymentIntentId, dbChargeId: row.stripeChargeId,
    providerStatus: intent.status, providerAmount: intent.amount,
    providerReceived: intent.amount_received, providerChargeIds: providerCharges.data.map((item) => item.id),
    providerRefunded: providerCharges.data.reduce((sum, item) => sum + item.amount_refunded, 0),
    walletLedgerRows: ledger, earningGross: earning ? String(earning.grossAmount) : null,
  };
}

(async () => {
  const row = await db.additionalCharge.findUniqueOrThrow({ where: { id: chargeId } });
  const customer = await db.user.findUniqueOrThrow({ where: { id: row.customerId } });
  assert.equal(customer.email, 'staging-customer@example.invalid');
  const before = await snapshot();
  assert.equal(before.dbStatus, 'CAPTURED');
  assert.equal(before.providerStatus, 'succeeded');
  assert.equal(before.providerChargeIds.length, 1);
  family = crypto.randomUUID();
  await db.refreshSession.create({ data: {
    id: family, familyId: family, userId: customer.id,
    tokenHash: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 60000),
  } });
  const payload = Buffer.from(JSON.stringify({
    sub: customer.id, email: customer.email, name: customer.name, role: customer.role,
    hasDriverProfile: false, sessionFamily: family, exp: Math.floor(Date.now() / 1000) + 60,
  })).toString('base64url');
  const token = payload + '.' + crypto.createHmac('sha256', process.env.ACCESS_TOKEN_SECRET).update(payload).digest('base64url');
  const responses = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`http://127.0.0.1:57431/customer/requests/${row.requestId}/additional-charges/${chargeId}/approve`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirmationLocale: 'en', confirmationText: 'Agree', paymentOption: 'SAVED_CARD' }),
      signal: AbortSignal.timeout(10000),
    });
    responses.push(response.status);
    assert.equal(response.status, 409);
  }
  const after = await snapshot();
  assert.deepEqual(after, before);
  fs.writeFileSync(output, JSON.stringify({ at: new Date().toISOString(), scope: 'Owned synthetic captured Stripe TEST additional expense; duplicate authenticated app API retries; no wallet debit expected for direct card', chargeId, before, retryHttpStatuses: responses, after }, null, 2) + '\n');
  console.log(JSON.stringify({ chargeId, retryHttpStatuses: responses, unchanged: true, providerChargeCount: after.providerChargeIds.length, output }));
})().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (family) await db.refreshSession.updateMany({ where: { familyId: family }, data: { revokedAt: new Date() } });
  await db.$disconnect();
});
