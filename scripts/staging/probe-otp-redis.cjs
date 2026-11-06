// One authorized review-number request through the full isolated HTTP stack.
// The review implementation sends no SMS. Never point this at another runtime.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Redis = require('ioredis');
const { root, assertRuntime } = require('./environment.cjs');
const config = assertRuntime();
assert.equal(config.PLAY_REVIEW_PHONE_NUMBER, '+12025550111');
assert.ok(config.PLAY_REVIEW_OTP_CODE);
const redis = new Redis({ host: config.REDIS_HOST, port: Number(config.REDIS_PORT), password: config.REDIS_PASSWORD, maxRetriesPerRequest: 1 });
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const keys = ['otp:send:phone:' + digest(config.PLAY_REVIEW_PHONE_NUMBER), 'otp:send:ip:' + digest('127.0.0.1')];
const record = { observedAt: new Date().toISOString(), scope: 'full isolated API/real Redis; authorized review number; no SMS delivery acceptance' };
(async () => {
  const before = (await redis.mget(...keys)).map(value => Number(value || 0));
  const send = () => fetch('http://127.0.0.1:57430/auth/phone/send-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phoneNumber: config.PLAY_REVIEW_PHONE_NUMBER }), signal: AbortSignal.timeout(10000) });
  const response = await send();
  record.firstStatus = response.status;
  assert.equal(response.status, 201, 'Expected first review request to pass its existing cooldown');
  const after = (await redis.mget(...keys)).map(value => Number(value || 0));
  assert.deepEqual(after, before.map(value => value + 1), 'Both phone and IP counters must use Redis on the first concurrent call');
  record.phoneAndIpCounterDeltas = after.map((value, index) => value - before[index]);
  const cooldown = await redis.ttl('otp:cooldown:' + digest(config.PLAY_REVIEW_PHONE_NUMBER));
  assert.ok(cooldown > 0 && cooldown <= 60); record.cooldownTtlSeconds = cooldown;
  const repeated = await send(); record.immediateRepeatStatus = repeated.status;
  assert.equal(repeated.status, 429);
  record.status = 'PASS';
  console.log('PASS full API + real Redis: first review send increments both counters, cooldown persisted, immediate repeat429. No SMS sent.');
})().catch(error => { record.status = 'FAIL'; record.error = error.message; console.error(error.message); process.exitCode = 1; }).finally(async () => {
  await redis.quit();
  fs.writeFileSync(path.join(root, 'docs/release-2026-11-05/evidence/dev-otp-redis-http.json'), JSON.stringify(record, null, 2) + '\n');
});
