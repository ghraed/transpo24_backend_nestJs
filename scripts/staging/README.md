# Isolated full application acceptance environment

Prepared 5 November 2026. **NOT READY** for release. This starts the real AppModule, production HTTP configuration, all modules, real Prisma/PostgreSQL, BullMQ/Redis booking and driver payout workers, and both raw-body Stripe webhook endpoints. It does not use `audit-customer-database.cjs` or override/stub providers.

Run from the API repository:

```sh
node scripts/staging/environment.cjs
npm run build
docker compose --env-file .staging-local/compose.env -f scripts/staging/compose.yaml up -d --wait postgres redis
node scripts/staging/run.cjs migrate
node scripts/staging/run.cjs catalog
docker compose --env-file .staging-local/compose.env -f scripts/staging/compose.yaml up -d --wait api proxy
node scripts/staging/run.cjs smoke
```

The generator refuses to replace an existing environment. Secrets are generated locally, stored with mode 0600 under ignored `.staging-local`, and never printed. It does not import a developer/production `.env`. The launcher passes an explicit environment to a child whose working directory is `.staging-local`, so Nest/dotenv cannot accidentally load repository production credentials. DATABASE_URL, Redis port, test mode, push scope and disabled destructive endpoints are checked before commands run.

PostgreSQL is exclusively `transpo24_staging_20261105` on loopback 57432 with a generated account/password; Redis uses its own authenticated instance on loopback 57433. The dedicated compose project and volumes have the prefix `transpo24-acceptance-20261105`. Never point this launcher at existing databases/Redis. Queue names lack an environment prefix, so do not share Redis with another deployment.

The full API listens on loopback 57430 behind the loopback-only proxy on 57431. The API/embedded workers and proxy now run in this compose project using the recorded digest-pinned official Node22 image. This Linux-local setup uses host networking to reach the two loopback-only dependencies; both servers explicitly bind 127.0.0.1. It is not a remotely deployed staging service. Runtime credentials are read only from the private generated file, sources/dependencies are mounted read-only, containers run as the local UID/GID with a read-only root filesystem, temporary /tmp and no Linux capabilities. Docker readiness checks PostgreSQL HTTP readiness; the full smoke still proves registered worker consumption. Both workers are embedded in AppModule; no separate fake or standalone worker was introduced. Run `node scripts/staging/run.cjs smoke` in another terminal. It verifies health, a real consent gate, acceptance persistence, STAGING push scope, signed webhook update/replay/rejections, actual queue workers consuming sweep jobs, and session revocation. The readiness route checks PostgreSQL only, so worker checks are mandatory.

Initially, external credentials are deliberately unconfigured: the Twilio service and Stripe client instantiate normally, but real provider operations cannot succeed. Locally generated platform and Connect webhook signing secrets exercise the genuine signature/mode/controller/service/persistence path. **This is not proof of Stripe-originated delivery, booking authorization/capture, SMS, FCM/APNs, real routing or OCR.** The later authorized TEST enablement imports only the existing explicit STRIPE_TEST_SECRET_KEY. The official CLI supplies TEST webhook forwarding; live/legacy and other provider credentials are never copied. Owner-approved staging-only provider configuration and delivery evidence remain gates.

## Controlled acknowledgment loss

For the prepared device case, the generated environment uses backend port 57430, with a proxy on 57431. The current private environment now also contains the explicitly reused Stripe TEST key; other providers remain unconfigured. The synthetic review number is reserved +12025550111; the generated code stays in the private environment file. This uses the existing review-login implementation, not real SMS. Do not enable the synthetic credentials outside this isolated environment.

```sh
docker compose --env-file .staging-local/compose.env -f scripts/staging/compose.yaml up -d --wait api proxy
```

`seed` creates only a clearly labeled synthetic chat eligibility trip/offer/hold/room; its seeded hold is **not** bank or wallet funding evidence. It creates a separate synthetic customer/driver and saves IDs in `.staging-local/chat-fixture.json`. Do not run it for financial acceptance. For native fault injection, arm `.staging-local/ack-loss.json` with `{"armed":true,"roomId":"the synthetic room id"}`. The proxy forces HTTP fallback (including rejecting socket polling), waits for the successful message response after commit, records only operation/message IDs, drops that response, and blocks further requests. Independently query the committed row, force-stop/restart only the staging app, then explicitly clear `blocked` to recover. Preserve control/DB/device evidence. This tests HTTP acknowledgment loss; it does not establish the socket-specific native loss case.

## Provider prerequisites and mobile artifacts

`node scripts/staging/inspect-prerequisites.cjs` emits presence/placeholder statuses and public package identities only. Read the generated evidence report for actual findings. Do not paste or commit credentials. Both apps accept `EXPO_ANDROID_STAGING_GOOGLE_SERVICES_FILE` and validate the matching `.staging` package when provided. Missing files remain absent instead of falling back to production Firebase.

Each mobile repository has `node scripts/build-controlled-staging.cjs`. It copies sources into `/tmp`, excludes dotenv/native/git inputs, prebuilds clean SDK56 Android, pins loopback API, selects only TEST publishable credentials, disables OTA, uses separate package IDs and local test signing, and builds arm64 APKs. The loopback cleartext exception is applied only in the isolated native copy. No EAS build, upload, OTA, store signing or publication occurs. Native library build caches under node_modules/Gradle can be reused; application native source inputs in the repository remain untouched. Final builds record source manifests and SHA-256 values. `--refresh-js <isolated source path>` is allowed only when app/config/package native inputs match, and refreshes the copied sources before an incremental local assembly.

The original credential-free APKs remain scoped to their consent/chat/payment/localization checks. Later clean builds include the approved private transpo24-staging Firebase files via --firebase-config; refresh-js is refused for that native change. FCM assignments were made only after explicit owner approval. Initial genuine native foreground sends failed FCM403 SERVICE_DISABLED in the reused key source project transpo24. The owner enabled it; later genuine API retries failed IAM_PERMISSION_DENIED for projects/transpo24. The owner requires the existing key; the Expo target-project routing problem and lifecycle acceptance remain open. Maps acceptance requires another clean build with approved restricted staging keys; the build script deliberately does not import those from developer env files.

## Stop and resume

Stop any task-owned CLI/local alternative processes gracefully with SIGTERM, then `docker compose --env-file .staging-local/compose.env -f scripts/staging/compose.yaml stop`. Volumes and private environment are retained for reproducibility; restart with `up -d --wait`. Do not run `down -v` or remove the environment without first exporting needed synthetic evidence. Never stop or delete unrelated containers. Remove only the task's own adb reverse mapping after device checks. Staging apps may remain installed but should be logged out/force-stopped after acceptance. Production/dev apps and unrelated device settings are outside cleanup scope.

## Authorized Stripe TEST provider phase

`node scripts/staging/enable-stripe-test.cjs` copies only the existing explicit TEST key from the previously authorized local key file, refusing missing/live/legacy credentials. `run.cjs stripe-preflight` retrieves the prior TEST connected account without changing it; all three enabled/submitted flags passed. The account record is preserved privately for fixture setup.

The official Stripe CLI v1.55.8 was downloaded from the Stripe GitHub release into /tmp and its archive checksum verified. `run.cjs stripe-forward` starts TEST-only @self and @accounts listeners, with credentials in the child environment and a private config path. It captures signing secrets privately and emits only readiness and HTTP status markers. No public tunnel, Dashboard endpoint deployment or account configuration change is performed. The CLI returned the same signing secret for both scopes despite distinct listener names; this is recorded explicitly and is not proof of independent deployed platform/Connect credential isolation. Restart the API after listener readiness to load the private secrets.

`run.cjs seed-native-payments` creates a new synthetic TEST customer and authentication-required test card plus four unaccepted quote fixtures and seeded driver/vehicle/document eligibility. No authorization or capture is seeded. Native UI and the genuine HTTP/modules/booking workers must perform confirmation and bank approval. Seeded eligibility is not onboarding/journey acceptance. Provider objects must be cleaned up using the private run record after acceptance; never delete or alter the prior connected account.

For acknowledgment loss, two deliberately stale history responses were served during the driver restart probe (the first cold deep link fell back to the job list). The app was then opened via its Chat list, recovered its pending composer from persisted storage, and a native retry returned the original message ID with one database row. The proxy's HTTP-only/stale-history scope is explicit; it is not a general WebSocket or attachment acceptance claim.

## Final continuation outcomes and remaining gates

The original command-session API/proxy/CLI exited repeatedly during acceptance; cause was not established. The API and proxy were moved into the four-service local compose stack, which passed fresh full-module smoke and the final native post-provider-success termination/reconciliation case. Do not start `run.cjs serve`/`proxy` alongside those containers. These direct actions remain available only as a debugging alternative after stopping their respective compose services. Existing private compose.env files need local STAGING_UID/STAGING_GID entries; the generator now includes them. The official Node image digest is pinned in compose.yaml; host node_modules/dist are mounted, so run the tested dependency installation/backports and API build before startup. Do not mount unrelated dotenv/provider files.

Native TEST 3DS approve, clean cancel, force-stop before success/restart/approve, and force-stop after observed success/restart all have scoped evidence. Each of the six owned financial attempts has exactly one DB hold/TEST PaymentIntent and zero captured funds. The failed consumed-clone case and interrupted timeout case are preserved separately. API recovery was fixed to reclone the owned card on the same intent, including canonical recovery after lost worker confirmation responses. Ten actual delivered TEST events were retrieved from Stripe to verify origin; the official CLI still experienced exits, so sustained forwarding/reconnect and independent endpoint credentials remain gates. See the device checklist for exact timestamps/hashes and broader missing journeys.

`native-payment-status <purpose> kill-before` refuses termination unless the provider is awaiting action. `watch-kill-after` observes only the owned intent for at most90 seconds, force-stops on requires_capture and records timestamps; it does not guarantee termination before the SDK callback, only after observed provider success. `cleanup-native-payments` verifies TEST mode and request metadata before cancelling/refunding only these owned objects and retaining provider/ledger history. The synthetic TEST customer/card is retained privately for reproducibility; the prior connected account is never deleted.
