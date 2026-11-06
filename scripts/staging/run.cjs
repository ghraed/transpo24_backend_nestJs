const { spawn } = require('node:child_process');
const path = require('node:path');
const { root, runtime, load } = require('./environment.cjs');
// Allow only OS essentials. Never inherit production credentials, proxy tokens or dotenv.
const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', ...load() };
const action = process.argv[2];
const actions = {
  'seed-dev-private-file': [path.join(__dirname, 'seed-dev-private-file.cjs')],
  'dev-driver-switch': [path.join(__dirname, 'dev-driver-switch.cjs'), ...process.argv.slice(3)],
  'inspect-dev-finance': [path.join(__dirname, 'inspect-dev-finance.cjs'), ...process.argv.slice(3)],
  'dev-account-switch': [path.join(__dirname, 'dev-account-switch.cjs'), ...process.argv.slice(3)],
  'inspect-dev-identity': [path.join(__dirname, 'inspect-dev-identity.cjs')],
  'probe-dev-routes': [path.join(__dirname, 'probe-dev-routes.cjs')],
  'inspect-dev-chat': [path.join(__dirname, 'inspect-dev-chat.cjs'), ...process.argv.slice(3)],
  'observe-dev-chat': [path.join(__dirname, 'observe-dev-chat.cjs'), ...process.argv.slice(3)],
  'prepare-dev-chat': [path.join(__dirname, 'prepare-dev-chat.cjs')],
  'seed-dev-financial': [path.join(__dirname, 'seed-dev-financial.cjs')],
  'probe-otp-redis': [path.join(__dirname, 'probe-otp-redis.cjs')],
  'accept-chat-replay': [path.join(__dirname, 'accept-chat-replay.cjs'), ...process.argv.slice(3)],
  migrate: [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', path.join(root, 'prisma.config.ts')],
  serve: [path.join(__dirname, 'serve.cjs')],
  smoke: [path.join(__dirname, 'smoke.cjs')],
  proxy: [path.join(__dirname, 'ack-loss-proxy.cjs')],
  seed: [path.join(__dirname, 'seed-chat.cjs')],
  catalog: [path.join(__dirname, 'seed-catalog.cjs')],
  'cleanup-native-payments': [path.join(__dirname, 'cleanup-native-payments.cjs')],
  'native-payment-status': [path.join(__dirname, 'native-payment-status.cjs'), ...process.argv.slice(3)],
  'seed-native-payments': [path.join(__dirname, 'seed-native-payments.cjs')],
  'stripe-forward': [path.join(__dirname, 'stripe-forward.cjs')],
  'push-receipts': [path.join(__dirname, 'push-receipts.cjs')],
  'stripe-preflight': [path.join(__dirname, 'stripe-preflight.cjs')],
  'verify-chat': [path.join(__dirname, 'verify-chat.cjs'), ...process.argv.slice(3)],
};
if (!actions[action]) throw new Error('Use migrate, serve, proxy, seed or smoke');
const child = spawn(process.execPath, actions[action], { cwd: runtime, env, stdio: 'inherit' });
let requestedSignal = null;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { requestedSignal = signal; child.kill(signal); });
child.on('exit', (code, signal) => {
  if (requestedSignal && signal === requestedSignal) { process.exitCode = 0; return; }
  if (!requestedSignal && ['serve','proxy','stripe-forward'].includes(action) && code === 0) {
    console.error('STAGING_RUNTIME_STOPPED_UNEXPECTEDLY: ' + action + '; NOT READY.');
    process.exitCode = 1; return;
  }
  process.exitCode = code ?? (signal ? 1 : 0);
});
