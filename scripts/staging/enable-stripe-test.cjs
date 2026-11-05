// Opt-in for this authorized acceptance task. Copies only the explicitly selected
// existing TEST key; never imports legacy/live provider or application settings.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { root, runtime, load } = require('./environment.cjs');
const source = parseEnv(fs.readFileSync(path.join(root,'.env.stripe-production.local'),'utf8'));
const testKey = source.STRIPE_TEST_SECRET_KEY?.trim();
if (!testKey?.startsWith('sk_test_') || testKey.length < 20) throw new Error('An existing explicit Stripe TEST key is required');
const env = load();
env.STRIPE_TEST_SECRET_KEY = testKey;
env.EXTERNAL_PROVIDER_ACCEPTANCE = 'STRIPE_TEST_ENABLED_OTHER_PROVIDERS_UNCONFIGURED';
fs.writeFileSync(path.join(runtime,'environment.json'),JSON.stringify(env,null,2),{mode:0o600});
console.log('Imported the existing explicit TEST key into the private isolated environment. No live/legacy key or other provider settings copied. Restart the local API before using it. Provider-originated platform/Connect webhook forwarding remains unconfigured.');
