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
const requestId = 'cmw3vo3250002iefvd12wjj3a';
const output = path.join(root, 'docs/release-2026-11-05/evidence/nov06-admin-refund-final-reconciliation.json');
let family;
let customerFamily;

(async () => {
  assert.ok(process.env.STRIPE_TEST_SECRET_KEY.startsWith('sk_test_'));
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'staging-refund-reviewer@example.invalid' } });
  assert.equal(admin.role, 'ADMIN');
  family = crypto.randomUUID();
  await db.refreshSession.create({ data: { id: family, familyId: family, userId: admin.id, tokenHash: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 60000) } });
  const payload = Buffer.from(JSON.stringify({ sub: admin.id, email: admin.email, name: admin.name, role: admin.role, hasDriverProfile: false, sessionFamily: family, exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
  const bearer = payload + '.' + crypto.createHmac('sha256', process.env.ACCESS_TOKEN_SECRET).update(payload).digest('base64url');
  const customer = await db.user.findUniqueOrThrow({ where: { email: 'staging-customer@example.invalid' } });
  customerFamily = crypto.randomUUID();
  await db.refreshSession.create({ data: { id: customerFamily, familyId: customerFamily, userId: customer.id, tokenHash: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + 60000) } });
  const customerPayload = Buffer.from(JSON.stringify({ sub: customer.id, email: customer.email, name: customer.name, role: customer.role, hasDriverProfile: false, sessionFamily: customerFamily, exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
  const customerBearer = customerPayload + '.' + crypto.createHmac('sha256', process.env.ACCESS_TOKEN_SECRET).update(customerPayload).digest('base64url');
  const customerPayment = await fetch(`http://127.0.0.1:57431/customer/requests/${requestId}/payment`, { headers: { authorization: `Bearer ${customerBearer}` }, signal: AbortSignal.timeout(10000) });
  assert.equal(customerPayment.status, 200);
  const customerPaymentBody = await customerPayment.json();
  assert.equal(customerPaymentBody.status, 'PAYMENT_REFUNDED');
  const uncapturedRequestId = 'cmw5dkgbi00004ffv91k9rxf3';
  const uncapturedHold = await db.paymentHold.findUniqueOrThrow({ where: { requestId: uncapturedRequestId } });
  assert.equal(uncapturedHold.status, 'PAYMENT_HELD');
  const uncapturedBefore = await stripe.refunds.list({ payment_intent: uncapturedHold.stripePaymentIntentId }, { stripeAccount: uncapturedHold.stripeAccountId });
  const rejected = await fetch(`http://127.0.0.1:57431/admin/payments/trips/${uncapturedRequestId}/refund`, { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify({ expectedAmount: 10.5, reason: 'SYNTHETIC uncaptured hold must not be refunded.' }), signal: AbortSignal.timeout(10000) });
  assert.equal(rejected.status, 409);
  const uncapturedAfter = await stripe.refunds.list({ payment_intent: uncapturedHold.stripePaymentIntentId }, { stripeAccount: uncapturedHold.stripeAccountId });
  assert.deepEqual(uncapturedAfter.data.map((item) => item.id), uncapturedBefore.data.map((item) => item.id));
  const response = await fetch('http://127.0.0.1:57431/admin/payments/reconciliation/run', { method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify({ stream: 'refunds' }), signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 201);
  const run = await response.json();
  const settlement = await db.tripPaymentSettlement.findUniqueOrThrow({ where: { requestId } });
  const earning = await db.driverEarning.findUnique({ where: { tripId: requestId } });
  const hold = await db.paymentHold.findUniqueOrThrow({ where: { requestId } });
  const record = await db.paymentReconciliationRecord.findFirst({ where: { tripId: requestId, stream: 'REFUND' }, orderBy: { createdAt: 'desc' } });
  assert.ok(record);
  const providerRefund = await stripe.refunds.retrieve(settlement.lastStripeRefundId, {}, { stripeAccount: hold.stripeAccountId });
  const charge = await stripe.charges.retrieve(hold.stripeChargeId, {}, { stripeAccount: hold.stripeAccountId });
  const fee = charge.application_fee ? await stripe.applicationFees.retrieve(charge.application_fee) : null;
  const events = await stripe.events.list({ limit: 100 }, { stripeAccount: hold.stripeAccountId });
  const chargeRefundEvent = events.data.find((event) => event.type === 'charge.refunded' && event.data?.object?.id === charge.id);
  const webhookLines = fs.readFileSync(path.join(root, 'docs/release-2026-11-05/evidence/stripe-provider-webhooks.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const receiver = webhookLines.find((line) => line.eventId === chargeRefundEvent?.id && line.httpStatus === 201);
  const result = {
    at: new Date().toISOString(), requestId, refundId: providerRefund.id,
    provider: { livemode: charge.livemode, status: providerRefund.status, amount: providerRefund.amount, currency: providerRefund.currency, chargeRefunded: charge.amount_refunded, applicationFeeAmount: fee?.amount ?? null, applicationFeeRefunded: fee?.amount_refunded ?? null },
    database: { holdStatus: hold.status, settlementStatus: settlement.status, collected: String(settlement.collectedAmount), refunded: String(settlement.refundedAmount), retained: String(settlement.retainedAmount), driverShare: String(settlement.driverShareAmount), platformShare: String(settlement.platformShareAmount), refundId: settlement.lastStripeRefundId, reviewedByAdminId: settlement.refundReviewedByAdminId, reviewReasonPresent: !!settlement.refundReviewReason, refundRequestedAtPresent: !!settlement.refundRequestedAt, payoutState: settlement.driverPayoutState, requiresManualReview: settlement.requiresManualReview, earningStatus: earning?.status ?? null, earningTransferStatus: earning?.stripeTransferStatus ?? null, walletLedgerRows: await db.customerWalletTransaction.count({ where: { paymentHoldId: hold.id } }) },
    reconciliation: { runCount: run.runs?.length ?? 0, recordId: record.id, status: record.status, expected: record.expectedAmount ? String(record.expectedAmount) : null, actual: record.actualAmount ? String(record.actualAmount) : null, externalReference: record.externalReference },
    webhook: { providerEventId: chargeRefundEvent?.id ?? null, genuineConnectHttp201Observed: !!receiver },
    customerPaymentRead: { httpStatus: customerPayment.status, status: customerPaymentBody.status },
    uncapturedHoldRejection: { requestId: uncapturedRequestId, httpStatus: rejected.status, providerRefundCountBefore: uncapturedBefore.data.length, providerRefundCountAfter: uncapturedAfter.data.length },
  };
  assert.equal(result.provider.livemode, false);
  assert.equal(result.provider.status, 'succeeded');
  assert.equal(result.provider.amount, 1050);
  assert.equal(result.provider.chargeRefunded, 1050);
  assert.equal(result.provider.applicationFeeRefunded, 200);
  assert.equal(result.database.refundId, result.refundId);
  assert.equal(result.database.requiresManualReview, true);
  assert.equal(result.database.earningStatus, 'PAID_OUT');
  assert.equal(result.reconciliation.status, 'MATCHED');
  assert.equal(result.webhook.genuineConnectHttp201Observed, true);
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ refundId: result.refundId, providerStatus: result.provider.status, reconciliation: result.reconciliation.status, webhook201: result.webhook.genuineConnectHttp201Observed, output }));
})().catch((error) => { console.error('Refund reconciliation failed: ' + error.message); process.exitCode = 1; }).finally(async () => {
  if (family) await db.refreshSession.updateMany({ where: { familyId: family }, data: { revokedAt: new Date() } });
  if (customerFamily) await db.refreshSession.updateMany({ where: { familyId: customerFamily }, data: { revokedAt: new Date() } });
  await db.$disconnect();
});
