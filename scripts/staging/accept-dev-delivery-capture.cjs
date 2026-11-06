// Scoped full-API/Stripe TEST capture probe for the retained synthetic Basel request.
// Coordinates and proof pixels are synthetic: never claim native GPS or full-journey acceptance.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const Stripe = require('stripe');
const sharp = require('sharp');
const { io } = require(path.join(__dirname, '../../../client_mobile/node_modules/socket.io-client'));
const { root, runtime, assertRuntime } = require('./environment.cjs');
assertRuntime();
const { PrismaService } = require('../../dist/src/prisma/prisma.service');
const db = new PrismaService();
const stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 0 });
const fixture = JSON.parse(fs.readFileSync(path.join(runtime, 'native-payment-fixtures.json'), 'utf8'));
const owned = fixture.requests.find((row) => row.purpose === 'native-dev-cancellation');
const output = path.join(root, 'docs/release-2026-11-05/evidence/nov06-synthetic-coordinate-delivery-capture.json');
const record = {
  startedAt: new Date().toISOString(),
  requestId: owned?.requestId,
  scope: 'Real isolated HTTP/WebSocket AppModule and Stripe TEST; synthetic Basel coordinates and generated proof pixels, not native GPS/photo or full journey',
  steps: [],
};
const save = () => fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n');
const families = [];
let socket;

function token(user, family) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id, email: user.email, name: user.name, role: user.role,
    hasDriverProfile: user.role === 'DRIVER', sessionFamily: family,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.ACCESS_TOKEN_SECRET).update(payload).digest('base64url');
}

async function session(user) {
  const family = crypto.randomUUID();
  await db.refreshSession.create({ data: {
    id: family, familyId: family, userId: user.id,
    tokenHash: crypto.randomBytes(32).toString('hex'),
    expiresAt: new Date(Date.now() + 3600000),
  }});
  families.push(family);
  return token(user, family);
}

async function http(method, route, bearer, body) {
  const multipart = body instanceof FormData;
  const response = await fetch('http://127.0.0.1:57431' + route, {
    method, headers: { authorization: 'Bearer ' + bearer, ...(multipart ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const raw = await response.text();
    let message = '';
    try { message = String(JSON.parse(raw).message ?? ''); } catch { /* Keep only status. */ }
    throw new Error(`${method} ${route} returned HTTP${response.status}${message ? ': ' + message.slice(0, 180) : ''}`);
  }
  return response.json();
}

async function proof(stage, latitude, longitude) {
  const data = new FormData();
  data.set('latitude', String(latitude));
  data.set('longitude', String(longitude));
  data.set('notes', `SYNTHETIC ${stage} pixels and Basel coordinate; backend/provider scope only`);
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffee00' } }).png().toBuffer();
  data.set('photos', new Blob([png], { type: 'image/png' }), `synthetic-${stage}.png`);
  return data;
}

async function status() {
  return db.transportRequest.findUniqueOrThrow({ where: { id: owned.requestId }, select: {
    id: true, status: true, customerId: true, assignedDriverId: true,
    pickupLatitude: true, pickupLongitude: true, dropoffLatitude: true, dropoffLongitude: true,
    deliveryConfirmedByCustomerAt: true,
  }});
}

async function awaitStatus(expected) {
  for (let i = 0; i < 30; i++) {
    const row = await status();
    if (row.status === expected) return row;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Expected request status ${expected} was not reached`);
}

(async () => {
  assert.ok(owned?.requestId && owned.offerId, 'Expected retained synthetic fixture');
  const initial = await status();
  assert.equal(initial.customerId, fixture.customerId);
  assert.ok(['DRIVER_GOING_TO_PICKUP', 'DRIVER_ARRIVED_PICKUP', 'ITEM_PICKED_UP', 'DRIVER_GOING_TO_DROPOFF', 'DELIVERED'].includes(initial.status));
  assert.ok(initial.assignedDriverId);
  const driver = await db.driverProfile.findUniqueOrThrow({ where: { id: initial.assignedDriverId }, include: { user: true } });
  const customer = await db.user.findUniqueOrThrow({ where: { id: fixture.customerId } });
  assert.equal(customer.email, 'staging-customer@example.invalid');
  assert.equal(driver.user.email, 'staging-driver@example.invalid');
  const hold = await db.paymentHold.findUniqueOrThrow({ where: { requestId: owned.requestId } });
  assert.ok(['PAYMENT_HELD', 'CAPTURED', 'PAYMENT_CAPTURED', 'COMPLETED'].includes(hold.status), `Unexpected hold status ${hold.status}`);
  assert.equal(hold.stripeAccountId, fixture.accountId);
  assert.ok(hold.stripePaymentIntentId);
  const before = await stripe.paymentIntents.retrieve(hold.stripePaymentIntentId, {}, { stripeAccount: hold.stripeAccountId });
  assert.equal(before.livemode, false);
  assert.ok(['requires_capture', 'succeeded'].includes(before.status));
  if (before.status === 'requires_capture') assert.equal(before.amount_received, 0);
  record.before = { requestStatus: initial.status, paymentStatus: hold.status, providerStatus: before.status, amountCapturable: before.amount_capturable, amountReceived: before.amount_received, intentId: before.id };
  save();
  const driverBearer = await session(driver.user);
  const customerBearer = await session(customer);
  if (initial.status === 'DRIVER_GOING_TO_PICKUP') {
    socket = io('http://127.0.0.1:57430', { transports: ['websocket'], auth: { token: driverBearer }, reconnection: false });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Driver socket connect timeout')), 10000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', () => { clearTimeout(timer); reject(new Error('Driver socket connect failed')); });
    });
    socket.emit('driverArrivedPickup', { tripId: owned.requestId, latitude: initial.pickupLatitude, longitude: initial.pickupLongitude });
    await awaitStatus('DRIVER_ARRIVED_PICKUP');
    record.steps.push('Real driver socket arrival accepted with synthetic Basel coordinate'); save();
  }
  if ((await status()).status === 'DRIVER_ARRIVED_PICKUP') {
    await http('PATCH', `/driver/trips/${owned.requestId}/pickup-item`, driverBearer, await proof('pickup', initial.pickupLatitude, initial.pickupLongitude));
    await awaitStatus('ITEM_PICKED_UP');
    record.steps.push('Real driver HTTP pickup accepted with generated synthetic PNG proof'); save();
  }
  if ((await status()).status === 'ITEM_PICKED_UP') {
    await http('PATCH', `/driver/trips/${owned.requestId}/start-delivery`, driverBearer, {});
    await awaitStatus('DRIVER_GOING_TO_DROPOFF');
    record.steps.push('Real driver HTTP start-delivery accepted'); save();
  }
  if ((await status()).status === 'DRIVER_GOING_TO_DROPOFF') {
    await http('PATCH', `/driver/trips/${owned.requestId}/deliver-item`, driverBearer, await proof('delivery', initial.dropoffLatitude, initial.dropoffLongitude));
    await awaitStatus('DELIVERED');
    record.steps.push('Real driver HTTP delivery accepted with generated synthetic PNG proof'); save();
  }
  if (before.status === 'requires_capture') {
    const currentPolicy = await http('GET', '/customer/payment-policy', customerBearer);
    await http('POST', `/customer/trips/${owned.requestId}/confirm-delivery`, customerBearer, { policyVersion: currentPolicy.version });
    record.steps.push('Real customer HTTP delivery confirmation accepted current payment policy'); save();
  } else {
    assert.ok(initial.deliveryConfirmedByCustomerAt, 'Native customer confirmation must precede captured provider state');
    record.steps.push('Native customer delivery confirmation already completed with policy consent'); save();
  }
  const first = await stripe.paymentIntents.retrieve(before.id, { expand: ['latest_charge'] }, { stripeAccount: hold.stripeAccountId });
  assert.equal(first.status, 'succeeded');
  assert.equal(first.amount_received, before.amount);
  assert.equal(first.amount_capturable, 0);
  const chargeId = typeof first.latest_charge === 'string' ? first.latest_charge : first.latest_charge?.id;
  assert.ok(chargeId);
  const currentPolicy = await http('GET', '/customer/payment-policy', customerBearer);
  await http('POST', `/customer/trips/${owned.requestId}/confirm-delivery`, customerBearer, { policyVersion: currentPolicy.version });
  const second = await stripe.paymentIntents.retrieve(before.id, { expand: ['latest_charge'] }, { stripeAccount: hold.stripeAccountId });
  const repeatedChargeId = typeof second.latest_charge === 'string' ? second.latest_charge : second.latest_charge?.id;
  assert.equal(repeatedChargeId, chargeId);
  assert.equal(second.amount_received, first.amount_received);
  const attempts = await stripe.charges.list({ limit: 100 }, { stripeAccount: hold.stripeAccountId });
  assert.equal(attempts.data.filter((charge) => charge.payment_intent === before.id && charge.captured).length, 1);
  const afterHold = await db.paymentHold.findUniqueOrThrow({ where: { requestId: owned.requestId } });
  const settlement = await db.tripPaymentSettlement.findUnique({ where: { requestId: owned.requestId } });
  const photos = await db.transportRequestProofPhoto.findMany({ where: { requestId: owned.requestId }, select: { type: true, mimeType: true, sizeBytes: true } });
  const walletLedger = await db.customerWalletTransaction.findMany({ where: { paymentHoldId: afterHold.id }, select: { id: true, type: true, amount: true } });
  record.after = {
    requestStatus: (await status()).status, holdStatus: afterHold.status,
    providerStatus: second.status, intentId: second.id, chargeId,
    amountReceived: second.amount_received, amountRefunded: typeof second.latest_charge === 'object' ? second.latest_charge.amount_refunded : null,
    capturedChargeAttempts: 1,
    settlement: settlement && { status: settlement.status, collectedAmount: settlement.collectedAmount, refundedAmount: settlement.refundedAmount, retainedAmount: settlement.retainedAmount, driverPayoutState: settlement.driverPayoutState },
    proofPhotos: photos, walletLedger,
  };
  record.status = 'PASS scoped backend/provider capture and retry; native GPS/full journey still blocked';
  record.completedAt = new Date().toISOString(); save();
  console.log('PASS scoped real TEST delivery capture: one connected-account intent/charge, repeated customer confirmation did not duplicate it. Synthetic coordinates/proof; native journey not accepted.');
})().catch((error) => {
  record.status = 'INCOMPLETE';
  record.error = error instanceof Error ? error.message.split('\n').slice(0, 5).join(' ').replace(/(?:sk|pk)_(?:test|live)_[^\s]+/g, '[redacted]') : 'Unknown error';
  record.failedAt = new Date().toISOString(); save();
  console.error('Scoped TEST delivery capture incomplete: ' + record.error);
  process.exitCode = 1;
}).finally(async () => {
  socket?.disconnect();
  if (families.length) await db.refreshSession.updateMany({ where: { id: { in: families } }, data: { revokedAt: new Date() } });
  record.syntheticProbeSessionsRevoked = true; save();
  await db.$disconnect();
});
