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

## Resume after the current disconnected-device continuation

New request/chat links are retained through authentication and consent, scoped to the consuming identity and checked against the full backend before opening. Driver RTL now uses Expo's release-capable reload. The new local APKs are not yet physically accepted: device7925f75a disconnected after initial identification. Recent `.dev` apps were preserved; their current backend/session configuration remains unverified. Use them only after establishing an isolated synthetic scope. Do not repoint an existing real-user session to this database. Update only the separate staging packages if that cannot be established.

The build helper now permits `--refresh-js` on a prior Firebase-enabled staging source only when its native Firebase bytes match the retained private input and the successful artifact's recorded SHA-256, and app/config/package native inputs are unchanged. A changed native configuration still requires a fresh build. Negative regression cases prove changed input/hash refusal before source copying or Gradle.

The fault proxy supports both text and attachment successful-response loss. `node scripts/staging/run.cjs accept-chat-replay` is an explicitly scoped full-API/DB/socket-observer probe using the existing synthetic chat only: the sender uses HTTP, then a fresh Node process retries. It does not simulate Android process restart or sender WebSocket acknowledgment loss. It requires zero active push tokens for both synthetic participants, preserves/restores the existing fault-control file, revokes its generated sessions, retains the synthetic messages/files and records `resume-chat-http.json`. Do not run a second fault probe concurrently.

To continue safely from the retained environment, run from the API repository:

```sh
npm run build
docker compose --env-file .staging-local/compose.env -f scripts/staging/compose.yaml up -d --wait postgres redis api proxy
node scripts/staging/run.cjs stripe-forward
```

Wait for both redacted `STRIPE_TEST_FORWARDER_READY` markers. Keep that terminal open; in another terminal:

```sh
docker compose --env-file .staging-local/compose.env -f scripts/staging/compose.yaml restart api
node scripts/staging/run.cjs smoke
adb devices -l
adb -s 7925f75a reverse tcp:57431 tcp:57431
```

Retain the already-approved Firebase files and existing Expo key assignments. The source/target push IAM mismatch remains blocked. Maps/routing and SMS require confirmed restricted staging provider setup before physical acceptance. Do not send to unapproved numbers/tokens.

Read each mobile repository's `resume-artifact.json` and verify its APK hash/signing/package before `adb install -r`; this updates only the `.staging` app while retaining its data. Re-login through the existing synthetic review flow when required (private code, no SMS), then retest both known defects before advancing other device gates. Do not clear storage or uninstall production/development apps. ADB `force-stop` is allowed only on the task's staging packages for explicitly labeled interruption cases; a normal lifecycle test needs a normal termination instead.

Stopping remains `docker compose ... stop`, never `down -v`; gracefully stop only the task-owned Stripe wrapper, and remove only reverse57431. Keep `.staging-local`, named volumes and all historical artifacts/evidence. See `PRODUCTION_READINESS_REPORT.md`, `DEVICE_RELEASE_CHECKLIST.md` and `TEST_MATRIX.md` for remaining gates; Android cannot close iOS/APNs/signing requirements.

## November 6 Dev continuation (supersedes the disconnected/staging-only instructions above)

Use only `com.transpo24.app.dev` and `com.transpo24.driver.dev` for this continuation. The user-installed November6 native hashes are recorded in `nov06-installed-dev-artifacts.json`; Metro8081/8082 supplies the separately hashed JS. These are Dev results, not signed RC/iOS acceptance. Never reinstall, clear or repoint an original signed-in account without first isolating its preferences.

The original November6 Dev preferences/sign-ins are privately retained in `.staging-local/dev-preservation-20261106/manifest.json`, host archives and on-device backup directories. November5 backups remain unchanged. A durable copy of the task-specific restoration helper is `.staging-local/dev-preservation-20261106/restore-original.py` (also `/tmp/transpo24-dev-restore-nov06.py`). It force-stops only the two Dev packages, retains synthetic preferences, restores all original preference bytes, verifies the original archive/SecureStore hashes and restores3001→3001. Run it once when this testing session ends; do not reuse it to overwrite changes made after a recorded restoration. Preserve the manifest and both copies of backups. Font/accessibility settings are separately saved in `device-settings.json` and `talkback-before.json`; restore and verify those when the accessibility check ends. No device security setting was disabled.

Resume the existing named stack rather than generating a new environment, seeding everything again or deleting volumes:

```sh
docker compose --env-file .staging-local/compose.env -f scripts/staging/compose.yaml up -d --wait postgres redis api proxy
```

If the task's official TEST forwarder is already alive, keep it; do not start duplicate listeners. Otherwise run `node scripts/staging/run.cjs stripe-forward`, wait for both readiness markers, and restart only the isolated API to load the private signing secrets. Both CLI scopes currently share a signing secret; deployed credential isolation and sustained delivery remain open. `node scripts/staging/run.cjs smoke` verifies full-module HTTP, actual worker consumption and locally signed webhook handling; it does not prove provider journeys.

After confirming a fresh preservation/isolation of original Dev credentials and signing in only to synthetic accounts, use:

```sh
adb -s 7925f75a reverse tcp:3001 tcp:57431
adb -s 7925f75a reverse tcp:8081 tcp:8081
adb -s 7925f75a reverse tcp:8082 tcp:8082
adb -s 7925f75a reverse --list
```

USB reconnection has repeatedly erased these rules. Recheck after every replug before any retry. Never substitute the original3001 database/Redis for this stack. Removing reverse alone does not prove an existing socket closed.

`ack-loss-proxy.cjs` now passes genuine WebSocket upgrades by default and can fault one exact room/operation or one exact additional-approval route. It records actual socket termination and suppresses the sender event/ACK only for the scoped operation. Native attachments use HTTP upload plus WebSocket events. Successful native replay must be reconciled with database rows and the independent recipient observer. Restore the saved `.staging-local/dev-nov06-fault-before.json` byte-for-byte at the end; its armed/blocked/forceHttp flags are false. Never leave a delay or mutation fault armed.

Bounded exact-path response delays support private files, customer status and driver/me. Driver normal API timeout is12s: the60s refresh attempt timed out and is NOT a late-success race pass. The10s fresh200 driver/logout case and9s customer private-PDF case completed after logout, with Login retained. `bypassConditionalCache` applies only to the explicit driver/me delay to avoid mistaking304 for a fresh response. `observePath` records only status/time for allowlisted owned request/job paths, never auth/body data.

`dev-account-switch` and `dev-driver-switch` retain their own synthetic identity manifests and temporarily associate only the previously authorized review number. Restore both associations to A after a test. DriverB approval is seeded and is not onboarding/provider acceptance. `seed-dev-private-file` creates exactly one separately retained synthetic DRAFT/task-PDF fixture for native read-session testing; it does not establish upload eligibility or a funded journey. Do not rerun fixture preparation over existing records. `inspect-dev-finance <label>` reads owned canonical Stripe TEST and database/settlement/ledger state without secrets or image data.

Current finances: native booking cancellation captured CHF1.58 and released CHF8.92; the extra charge captured CHF1 on its original intent after native TEST4242 selection. All TEST history is retained for subsequent reconciliation; a reserve release is not a refund and settlement PAID_OUT is not bank payout. Do not reuse `cleanup-native-payments` as proof of a native refund journey or assume it covers additional charges. No live funds/provider objects or prior connected account may be altered.

The later `run.cjs accept-dev-delivery-capture` probe uses real isolated driver socket/HTTP endpoints with generated PNGs and synthetic Basel coordinates for the retained booking after Dev customer offer acceptance and Stripe TEST hold authorization. Dev customer delivery confirmation reviewed the current payment policy; the probe verified the same connected TEST intent/charge on a repeated real confirmation, settlement and proof rows, and revoked its temporary synthetic sessions. See `nov06-synthetic-coordinate-delivery-capture.json`. This is scoped backend/provider finance evidence: driver Dev stopped at native GPS unavailable, and no native pickup/photo/route or complete journey is accepted. The delivered captured trip is past automatic cancellation and this probe is not a refund test.

The existing Maps key returned actual403 API_KEY_IP_ADDRESS_BLOCKED; the existing-key Expo path remains blocked by source/target project IAM mismatch; SMS is unconfigured. Do not change restrictions, IAM, credentials or key metadata. The Android device cannot close iOS gates. See the current November6 sections of all three audit documents for exact remaining tests and human/physical requirements.

At testing end restore original preferences, font/accessibility settings and original mappings3001→3001,8081→8081,8082→8082; verify hashes/settings/mappings. Keep all volumes, credentials and evidence. Stopping the isolated stack uses `stop`, never `down -v`; stop only the task-owned TEST wrapper if ending its forwarding session. Never push, deploy, publish or send OTA updates.
