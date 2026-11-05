const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Queue, QueueEvents } = require('bullmq');
const Stripe = require('stripe');
const { PrismaService } = require('../../dist/src/prisma/prisma.service');
const { hashPassword } = require('../../dist/src/common/security/password.util');
const { assertRuntime } = require('./environment.cjs');
assertRuntime(); // refuse another database/environment even when invoked directly
const base = 'http://127.0.0.1:57431';
const prisma = new PrismaService();
const connections = [];
const runId = crypto.randomUUID();
async function http(route, status = 200, options = {}) {
  const response = await fetch(base + route, { ...options, signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  assert.equal(response.status, status, `${route}: ${JSON.stringify(body)}`);
  return body;
}
function token(user, sessionFamily) {
  const encoded = Buffer.from(JSON.stringify({ sub: user.id, name: user.name, email: user.email, role: user.role, hasDriverProfile: user.role === 'DRIVER', sessionFamily, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url');
  return encoded + '.' + crypto.createHmac('sha256', process.env.ACCESS_TOKEN_SECRET).update(encoded).digest('base64url');
}
(async () => {
  await prisma.$connect();
  await http('/health/live'); await http('/health/ready');
  const user = await prisma.user.upsert({ where: { email: 'staging-smoke-driver@example.invalid' }, update: {}, create: { name: 'Synthetic Staging Driver', email: 'staging-smoke-driver@example.invalid', passwordHash: hashPassword(crypto.randomUUID()), phoneNumber: '+12025550119', countryCode: 'CH', role: 'DRIVER', driverProfile: { create: { firstName: 'Synthetic', lastName: 'Driver', phone: '+12025550119', countryCode: 'CH', stripeAccountId: 'acct_staging_smoke_synthetic' } } } });
  await prisma.driverProfile.update({ where: { userId: user.id }, data: { stripeDetailsSubmitted: false, stripePayoutsEnabled: false } });
  const family = crypto.randomUUID();
  await prisma.refreshSession.create({ data: { id: family, familyId: family, userId: user.id, tokenHash: crypto.randomBytes(32).toString('hex'), expiresAt: new Date(Date.now()+3600000) } });
  const headers = { authorization: 'Bearer ' + token(user, family), 'content-type': 'application/json' };
  await prisma.legalAcceptance.deleteMany({ where: { userId: user.id } });
  const legal = await http('/auth/legal', 200, { headers });
  await http('/push-tokens/environment', 409, { headers });
  await http('/auth/legal', 201, { method: 'POST', headers, body: JSON.stringify({ version: legal.version }) });
  const scope = await http('/push-tokens/environment', 200, { headers });
  assert.equal(scope.environment, 'STAGING');
  assert.deepEqual(scope.applicationIds, ['com.transpo24.app.staging','com.transpo24.driver.staging']);
  console.log('PASS full HTTP AppModule: health, missing-consent gate, explicit consent, STAGING push scope. Synthetic seed is not SMS acceptance.');
  const stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY);
  const event = { id: 'evt_staging_' + runId, object: 'event', created: Math.floor(Date.now()/1000), livemode: false, type: 'account.updated', account: 'acct_staging_smoke_synthetic', data: { object: { id: 'acct_staging_smoke_synthetic', details_submitted: true, payouts_enabled: true } } };
  async function webhook(connected, value, status, secret, corrupt = false) {
    const payload = JSON.stringify(value);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    return http('/webhooks/stripe' + (connected ? '/connect' : ''), status, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: corrupt ? payload + ' ' : payload });
  }
  const connectSecret = process.env.STRIPE_TEST_CONNECT_WEBHOOK_SECRET;
  await webhook(true, event, 201, connectSecret);
  await webhook(true, event, 201, connectSecret); // repeat after committed DB update
  const profile = await prisma.driverProfile.findUniqueOrThrow({ where: { userId: user.id } });
  assert.equal(profile.stripePayoutsEnabled, true); assert.equal(profile.stripeDetailsSubmitted, true);
  await webhook(true, event, 400, connectSecret, true);
  await webhook(true, { ...event, livemode: true }, 400, connectSecret);
  await webhook(true, { ...event, account: undefined }, 400, connectSecret);
  await webhook(true, event, 400, 'whsec_explicit_wrong_negative_probe');
  if (process.env.STRIPE_TEST_WEBHOOK_SECRET !== connectSecret) await webhook(true, event, 400, process.env.STRIPE_TEST_WEBHOOK_SECRET);
  else console.log('LIMIT: Stripe CLI supplies a shared TEST signing secret; independent platform/Connect credential isolation remains a release gate.');
  await webhook(false, { ...event, type: 'staging.signature_probe', account: undefined }, 201, process.env.STRIPE_TEST_WEBHOOK_SECRET);
  console.log('PASS real webhook controller/service + PostgreSQL: signed account update, duplicate replay, tamper/live/missing-account/wrong-endpoint-secret rejection. Signatures are generated locally; Stripe delivery and payment transitions remain separate gates.');
  const connection = { host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT), password: process.env.REDIS_PASSWORD, maxRetriesPerRequest: null };
  for (const [name, jobName] of [['booking-confirmations','sweep'],['driver-payouts','sweep-driver-payouts']]) {
    const queue = new Queue(name, { connection }); const events = new QueueEvents(name, { connection });
    connections.push(queue, events); await events.waitUntilReady();
    assert.ok((await queue.getWorkers()).length > 0, name + ' worker missing');
    const job = await queue.add(jobName, {}, { jobId: 'staging-smoke-' + runId, removeOnComplete: false });
    await job.waitUntilFinished(events, 20000);
    assert.equal(await job.getState(), 'completed');
    await job.remove();
    console.log(`PASS real BullMQ ${name}: registered worker consumed and completed a sweep job.`);
  }
  await prisma.refreshSession.updateMany({ where: { familyId: family }, data: { revokedAt: new Date() } });
  await http('/push-tokens/environment', 401, { headers });
  console.log('PASS family revocation through full HTTP guard.');
  console.log('NOT READY: provider delivery, bank authorization, physical GPS, native retry and full journeys are not established by this smoke.');
})().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(async () => { await Promise.all(connections.map(c => c.close())); await prisma.$disconnect(); });
