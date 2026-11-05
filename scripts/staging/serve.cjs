require('./environment.cjs').assertRuntime();
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/src/app.module');
const { configureHttpApplication } = require('../../dist/src/config/http');
(async () => {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureHttpApplication(app);
  // Evidence only: never persist raw webhook bodies or client secrets. Restrict
  // tracing to the four explicitly owned synthetic native request IDs.
  const fs = require('node:fs'); const path = require('node:path');
  const { root, runtime } = require('./environment.cjs');
  app.use('/webhooks/stripe', (request, response, next) => {
    try {
      const file = path.join(runtime, 'native-payment-fixtures.json');
      const owned = fs.existsSync(file) ? new Set(JSON.parse(fs.readFileSync(file, 'utf8')).requests.map(item => item.requestId)) : new Set();
      const event = Buffer.isBuffer(request.body) ? JSON.parse(request.body.toString('utf8')) : null;
      const requestId = event?.data?.object?.metadata?.requestId;
      if (event?.livemode === false && owned.has(requestId)) {
        const record = { receivedAt: new Date().toISOString(), eventId: event.id, type: event.type, accountId: event.account || null, requestId, objectId: event.data.object.id, livemode: false, route: request.originalUrl };
        response.once('finish', () => fs.appendFileSync(path.join(root, 'docs/release-2026-11-05/evidence/stripe-provider-webhooks.jsonl'), JSON.stringify({ ...record, httpStatus: response.statusCode }) + '\n'));
      }
    } catch { /* Evidence collection must never change genuine webhook processing. */ }
    next();
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT), '127.0.0.1');
  console.log('FULL_APPMODULE_STAGING_READY: booking + payout workers initialized; loopback only.');
})().catch(() => { console.error('Full staging bootstrap failed; inspect sanitized diagnostics.'); process.exitCode = 1; });
