const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Stripe = require('stripe');
const { root, load } = require('./environment.cjs');
Object.assign(process.env, load());
const { PrismaService } = require('../../dist/src/prisma/prisma.service');
const { hashPassword } = require('../../dist/src/common/security/password.util');
const db = new PrismaService();
const stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 0 });
const requestId = 'cmw3vo3250002iefvd12wjj3a';
const output = path.join(root, 'docs/release-2026-11-05/evidence/nov06-admin-reviewed-captured-refund.json');
const evidence = { at: new Date().toISOString(), requestId, scope: 'Owned synthetic delivered booking, authenticated admin route, Stripe TEST only; direct-charge payout history retained' };
const save = () => fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
const families = [];

function token(user, family) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id, email: user.email, name: user.name, role: user.role,
    hasDriverProfile: false, sessionFamily: family, exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.ACCESS_TOKEN_SECRET).update(payload).digest('base64url');
}

async function session(user) {
  const family = crypto.randomUUID();
  await db.refreshSession.create({ data: {
    id: family, familyId: family, userId: user.id,
    tokenHash: crypto.randomBytes(32).toString('hex'),
    expiresAt: new Date(Date.now() + 3600000),
  } });
  families.push(family);
  return token(user, family);
}

async function state() {
  const request = await db.transportRequest.findUniqueOrThrow({ where: { id: requestId }, select: {
    id: true, status: true, customerId: true, paymentStatus: true, deliveryConfirmedByCustomerAt: true,
  } });
  const hold = await db.paymentHold.findUniqueOrThrow({ where: { requestId } });
  const settlement = await db.tripPaymentSettlement.findUniqueOrThrow({ where: { requestId } });
  const earning = await db.driverEarning.findUnique({ where: { tripId: requestId } });
  const intent = await stripe.paymentIntents.retrieve(hold.stripePaymentIntentId, { expand: ['latest_charge'] }, { stripeAccount: hold.stripeAccountId });
  assert.equal(intent.livemode, false);
  const charge = intent.latest_charge;
  assert.ok(charge && typeof charge === 'object');
  const refunds = await stripe.refunds.list({ payment_intent: intent.id, limit: 100 }, { stripeAccount: hold.stripeAccountId });
  const ledgerCount = await db.customerWalletTransaction.count({ where: { paymentHoldId: hold.id } });
  return {
    request: { id: request.id, status: request.status, paymentStatus: request.paymentStatus, deliveryConfirmed: !!request.deliveryConfirmedByCustomerAt },
    hold: { id: hold.id, status: hold.status, provider: hold.provider, intentId: hold.stripePaymentIntentId, accountId: hold.stripeAccountId },
    settlement: { status: settlement.status, collected: String(settlement.collectedAmount), refunded: String(settlement.refundedAmount), retained: String(settlement.retainedAmount), driverShare: String(settlement.driverShareAmount), platformShare: String(settlement.platformShareAmount), payoutState: settlement.driverPayoutState, requiresManualReview: settlement.requiresManualReview, refundId: settlement.lastStripeRefundId, reviewedByAdminId: settlement.refundReviewedByAdminId, reviewReason: settlement.refundReviewReason },
    earning: earning ? { id: earning.id, status: earning.status, gross: String(earning.grossAmount), net: String(earning.netAmount), transferId: earning.stripeTransferId, transferStatus: earning.stripeTransferStatus } : null,
    stripe: { intentId: intent.id, intentStatus: intent.status, received: intent.amount_received, chargeId: charge.id, chargeCaptured: charge.captured, chargeRefunded: charge.amount_refunded, applicationFeeId: charge.application_fee, refunds: refunds.data.map((refund) => ({ id: refund.id, status: refund.status, amount: refund.amount, currency: refund.currency, metadataKind: refund.metadata?.kind })) },
    walletLedgerRows: ledgerCount,
  };
}

async function submit(bearer, body) {
  const response = await fetch(`http://127.0.0.1:57431/admin/payments/trips/${requestId}/refund`, {
    method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const value = await response.json();
  return { httpStatus: response.status, status: value.status ?? null, refundId: value.refundId ?? null, amount: value.amount ?? null };
}

(async () => {
  assert.ok(process.env.STRIPE_TEST_SECRET_KEY.startsWith('sk_test_'));
  const request = await db.transportRequest.findUniqueOrThrow({ where: { id: requestId }, select: { customer: { select: { id: true, email: true, name: true, role: true } } } });
  assert.equal(request.customer.email, 'staging-customer@example.invalid');
  evidence.before = await state(); save();
  assert.equal(evidence.before.request.status, 'DELIVERED');
  assert.equal(evidence.before.hold.status, 'PAYMENT_CAPTURED');
  assert.equal(evidence.before.stripe.intentStatus, 'succeeded');
  assert.equal(evidence.before.stripe.received, 1050);
  assert.equal(evidence.before.stripe.chargeRefunded, 0);
  assert.equal(evidence.before.stripe.refunds.length, 0);
  assert.equal(evidence.before.settlement.refunded, '0');
  const admin = await db.user.upsert({
    where: { email: 'staging-refund-reviewer@example.invalid' },
    update: {},
    create: { name: 'SYNTHETIC Refund Reviewer', email: 'staging-refund-reviewer@example.invalid', passwordHash: hashPassword(crypto.randomUUID()), role: 'ADMIN' },
  });
  assert.equal(admin.role, 'ADMIN');
  const customerToken = await session(request.customer);
  const adminToken = await session(admin);
  const body = { expectedAmount: 10.5, reason: 'SYNTHETIC customer refund approved after delivered booking review.' };
  evidence.wrongRole = await submit(customerToken, body);
  assert.equal(evidence.wrongRole.httpStatus, 403);
  evidence.first = await submit(adminToken, body); save();
  assert.equal(evidence.first.httpStatus, 201);
  assert.equal(evidence.first.status, 'SUCCEEDED');
  evidence.afterFirst = await state(); save();
  assert.equal(evidence.afterFirst.stripe.refunds.length, 1);
  assert.equal(evidence.afterFirst.stripe.refunds[0].status, 'succeeded');
  assert.equal(evidence.afterFirst.stripe.chargeRefunded, 1050);
  assert.equal(evidence.afterFirst.settlement.refunded, '10.5');
  assert.equal(evidence.afterFirst.settlement.refundId, evidence.afterFirst.stripe.refunds[0].id);
  assert.equal(evidence.afterFirst.settlement.payoutState, 'PAID_OUT');
  assert.equal(evidence.afterFirst.settlement.requiresManualReview, true);
  assert.equal(evidence.afterFirst.walletLedgerRows, 0);
  evidence.retries = [await submit(adminToken, body), await submit(adminToken, body)];
  evidence.afterRetries = await state(); save();
  assert.ok(evidence.retries.every((item) => item.httpStatus === 201 && item.refundId === evidence.first.refundId));
  assert.deepEqual(evidence.afterRetries.stripe.refunds, evidence.afterFirst.stripe.refunds);
  assert.equal(evidence.afterRetries.settlement.refundId, evidence.afterFirst.settlement.refundId);
  console.log(JSON.stringify({ requestId, refundId: evidence.first.refundId, status: evidence.first.status, providerRefundCount: evidence.afterRetries.stripe.refunds.length, duplicateStatuses: evidence.retries.map((item) => item.httpStatus), output }));
})().catch((error) => { evidence.error = error.message; save(); console.error('Admin TEST refund acceptance stopped: ' + error.message); process.exitCode = 1; }).finally(async () => {
  for (const family of families) await db.refreshSession.updateMany({ where: { familyId: family }, data: { revokedAt: new Date() } });
  await db.$disconnect();
});
