const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const runtime = path.join(root, '.staging-local');
function load() {
  const env = JSON.parse(fs.readFileSync(path.join(runtime, 'environment.json'), 'utf8'));
  const db = new URL(env.DATABASE_URL);
  if (db.hostname !== '127.0.0.1' || db.port !== '57432' || db.pathname !== '/transpo24_staging_20261105' || env.REDIS_PORT !== '57433' || env.PUSH_ENVIRONMENT !== 'STAGING' || env.STRIPE_MODE !== 'test' || !env.STRIPE_TEST_SECRET_KEY.startsWith('sk_test_') || env.ENABLE_TEST_ENDPOINTS !== 'false') throw new Error('Unsafe staging configuration');
  return env;
}
if (require.main === module) {
  if (fs.existsSync(path.join(runtime, 'environment.json'))) throw new Error('Existing staging environment preserved. Remove only after explicit fixture cleanup.');
  fs.mkdirSync(runtime, { mode: 0o700 });
  const random = () => crypto.randomBytes(32).toString('hex');
  const dbPassword = random(); const redisPassword = random();
  const env = {
    NODE_ENV: 'production', PORT: '57430', DATABASE_URL: `postgresql://transpo24_staging:${dbPassword}@127.0.0.1:57432/transpo24_staging_20261105?schema=public`,
    ACCESS_TOKEN_SECRET: random(), CORS_ORIGINS: 'http://127.0.0.1:8081,http://127.0.0.1:8082', TRUST_PROXY: 'false', ENABLE_TEST_ENDPOINTS: 'false',
    REDIS_HOST: '127.0.0.1', REDIS_PORT: '57433', REDIS_PASSWORD: redisPassword,
    PUSH_ENVIRONMENT: 'STAGING', STRIPE_MODE: 'test', STRIPE_TEST_SECRET_KEY: 'sk_test_isolated_unconfigured', STRIPE_TEST_WEBHOOK_SECRET: 'whsec_' + random(), STRIPE_TEST_CONNECT_WEBHOOK_SECRET: 'whsec_' + random(),
    STRIPE_CURRENCY: 'CHF', STRIPE_DIRECT_CHARGES_ENABLED: 'true', FURNITURE_RESERVATIONS_ENABLED: 'true', DELAYED_BOOKING_AUTHORIZATION_ENABLED: 'true',
    DRIVER_APP_BASE_URL: 'https://staging.invalid',
    TWILIO_ACCOUNT_SID: 'AC' + '0'.repeat(32), TWILIO_AUTH_TOKEN: 'unconfigured', TWILIO_VERIFY_SERVICE_SID: 'VA' + '0'.repeat(32),
    EXTERNAL_PROVIDER_ACCEPTANCE: 'BLOCKED_UNCONFIGURED',
  };
  fs.writeFileSync(path.join(runtime, 'environment.json'), JSON.stringify(env, null, 2), { mode: 0o600 });
  fs.writeFileSync(path.join(runtime, 'compose.env'), `STAGING_DB_PASSWORD=${dbPassword}\nSTAGING_REDIS_PASSWORD=${redisPassword}\nSTAGING_UID=${process.getuid()}\nSTAGING_GID=${process.getgid()}\n`, { mode: 0o600 });
  console.log('Generated isolated local environment; provider calls remain unconfigured. No existing env file was loaded.');
}
function assertRuntime() {
  const env = load();
  for (const key of ['DATABASE_URL','REDIS_HOST','REDIS_PORT','REDIS_PASSWORD','PUSH_ENVIRONMENT','STRIPE_MODE','STRIPE_TEST_SECRET_KEY','ACCESS_TOKEN_SECRET','ENABLE_TEST_ENDPOINTS','PORT']) {
    if (process.env[key] !== env[key]) throw new Error('Use run.cjs with the isolated staging environment; mismatched ' + key);
  }
  return env;
}
module.exports = { root, runtime, load, assertRuntime };
