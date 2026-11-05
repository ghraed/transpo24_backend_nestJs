# Continuation test matrix — 5 November 2026

**NOT READY.** Baseline evidence remains in the November 4 reports; the entries here describe new checks only.

| Area | New result | Evidence and boundary |
|---|---|---|
| API unit / HTTP regression | PASS | 1,174 unit / 21 HTTP tests; no external provider delivery claim |
| Customer regression | PASS | 660 tests after chat, callback and delayed-payment copy fixes, including staging config cases |
| Driver regression | PASS | 536 tests including final catalogs and staging config tests |
| TypeScript / privacy / lint | PASS with lint warnings | Logs in this and the two mobile evidence directories |
| image-size compatible backport | PASS local mitigation | Invalid ICNS/JXL/HEIF terminate under timeout; valid PNG/ICNS and actual native bundling pass; audit version unchanged |
| Zod3 bounded collection backport | PASS partial mitigation | CJS/ESM, sync/async, valid parses and zero oversized element visits; unconstrained and bundled-v4 exposure OPEN |
| Backport installation integrity | PASS | Pristine reconstruction, idempotent replay, changed-source rejection; normal postinstall hook installed |
| Remaining dependency release gate | OPEN | API 4 moderate; each app 3 high / 13 moderate / 1 low; no suppression/forced major override |
| Italian driver structural coverage | PASS automated | 1,216 initial Italian additions plus source-used key repairs; all six catalogs 1,754 source leaves; zero missing/placeholders mismatches |
| Human Italian / six-language review | NOT RUN | AI draft and existing values need human acceptance; parity is not linguistic approval |
| Full AppModule startup | PASS local | Digest-pinned Node API/proxy containers,  Real modules, production HTTP config, separate PostgreSQL/Redis, no provider overrides or limited UI fixture server |
| Migrations / synthetic catalog | PASS local | All 77 migrations; all four real service categories; isolated synthetic catalog |
| Booking and payment workers | PASS scoped | Actual registered workers consume/complete sweep jobs, including after dedicated Redis restart; no new financial workload acceptance claim |
| Webhook signature + persistence | PASS local | Real platform/Connect endpoints; signed synthetic account update persisted, duplicate replay, tamper/live/account/secret negatives |
| Stripe-originated webhook delivery | PASS scoped / OPEN broader | Actual TEST Connect failure/cancellation events reach genuine endpoint with 201 and provider origin verification; platform business events, independent deployed secrets and delivery resilience remain open |
| Staging environment confinement | PASS | Explicit child env + isolated cwd, generated private credentials, mismatched database rejected before connecting |
| Staging push/Firebase isolation | PASS automated | STAGING package matrix and native-config positive/mismatch negatives; both STAGING native token registrations pass; actual foreground delivery failed with source-project FCM SERVICE_DISABLED; background/normal-termination and APNs remain BLOCKED |
| Signed local Android assemblies | PASS | Fresh clean SDK56 native copies; arm64; target/compile36; driver1.0.10/customer1.0.7; test signing, OTA disabled, loopback API |
| APK secret/Maps scan | PASS scoped | Server-secret patterns absent; Firebase builds allow only approved staging Google client keys; loopback present; not a comprehensive secret audit |
| Native post-commit acknowledgment loss | PASS driver HTTP text | Physical force-stop/restart, deliberate stale-history fault, restored pending draft, native retry same operation/message identity and DB1 row; no socket/attachment claim |
| Native Stripe authorization / 3DS / kill recovery | PASS scoped | Native TEST 3DS2 approve/cancel and termination before/after provider success with recovery; six owned attempts each one DB hold and one intent, zero capture. Capture/payout/full journeys remain open |
| Outdoor/background/locked GPS + actual routing | BLOCKED / NOT RUN | Missing confirmed restricted staging Maps setup and physical movement evidence |
| SMS / foreground/background/terminated push | BLOCKED / NOT RUN | Review-code login sends no SMS; SMS destination/service and APNs remain missing. Android files/assignments/tokens exist, but genuine foreground receipts fail FCM403 SERVICE_DISABLED in existing-key project transpo24; source API enabled; later IAM denial targets projects/transpo24; existing-key Expo routing and all lifecycle tests remain open |
| Complete customer/driver journeys, account switching, RTL, a11y | OPEN | Native samples do not establish full journeys. Arabic mirrors after manual restart; normal switch announces reload but does not apply RTL immediately. Cold request link restoration also remains open |
| Signed iOS | BLOCKED | Linux host; no Xcode, staging profiles/APNs or connected test iPhone |
| Compatible rolling deployment / safe rollback | OPEN | Explicit cutover plan prepared; old clients incompatible; operator rehearsal and bridge/fleet evidence absent |
| Production restore, uploads, alerts, OCR/distributed dedupe | OPEN baseline gates | No previous local PASS promoted to cover production operations |

Initial mobile Jest runs had passing assertions but nonzero teardown exits. Final runs used `EXPO_PUBLIC_USE_RN_FETCH=1` only in Jest and exited 0. Initial failures/logs are retained alongside final logs. Provider errors in mocked unit negatives are not actual SMS/push/provider deliveries.

## Update after source API enablement

The owner enabled the source-project FCM API. Fresh target-project validate-only remains HTTP200. Two separately labeled retries through genuine authenticated API ingress now fail with **FCM403 IAM_PERMISSION_DENIED**, permission `cloudmessaging.messages.create`, resource **projects/transpo24**. Thus the earlier SERVICE_DISABLED blocker cleared, but the current Expo route still targets the key's source project instead of **transpo24-staging**. Both failed receipts and zero own active notifications are retained. These retries used previously native-issued tokens and genuine API registration/test endpoints; they are not successful native foreground/background lifecycle acceptance. No direct FCM sender or fixture was substituted.

Google documents cross-project service-account use only when requests target the destination project endpoint. Our direct validate-only target check meets that condition; the observed Expo route does not. Expo's documented setup uses an FCM credential matching the app's Firebase sender. The owner confirmed the existing-key requirement; the previously suggested replacement-key action is canceled. No supported Expo target override was found, so push remains blocked under the existing configuration. Do not broaden messaging permissions in the source project to conceal the wrong target, rewrite the existing key's project metadata, or silently close push gates.
