# Continuation test matrix — 5 November 2026

## November 6 admin-reviewed captured refund (latest; supersedes the earlier OPEN refund row)

| Check | Result | Exact scope / boundary |
|---|---|---|
| Actual refund of captured payment | **PASS scoped Stripe TEST and admin API** | Admin-authenticated full CHF10.50 refund `re_3UYsN0ClGb3s3rvz0INYYwqw` on previously captured/delivered connected charge `ch_3UYsN0ClGb3s3rvz0kknQT8o`; provider `succeeded`, charge refunded1050 minor, application fee CHF2 refunded. DB hold/request `PAYMENT_REFUNDED`, settlement `REFUNDED` collected10.50/refunded10.50/retained0, real refund ID and admin review fields; direct-card wallet ledger0. Customer role403; two admin retries201 returned same refund; one provider refund after worker smoke. A separate admin attempt against the uncaptured Google Pay hold returned409 and created zero refunds. Genuine Connect `charge.refunded` webhook201 and admin refund reconciliation MATCHED. Paid-out direct-charge earning remains historical PAID_OUT with settlement manual-review flag; bank payout/clawback not accepted. This is distinct from the earlier uncaptured CHF8.92 hold release. |
| Admin refund implementation | PASS source/build; browser click OPEN | Guarded admin endpoint requires exact expected full amount and review reason; provider refund list and stable idempotency key recover lost responses. Admin Delivery Operations form built/typechecked; no deployed admin or browser click was used. Non-destructive isolated migration applied. |
| Final regressions | PASS | API 95 suites/1185 tests, Prisma validate, API build and changed-file lint; admin optimized build/typecheck; real booking/payout worker and locally signed webhook smoke. Dev APKs and restored preferences unchanged. Signed release separate. |

Evidence: `evidence/nov06-admin-reviewed-captured-refund.json`, `evidence/nov06-admin-refund-final-reconciliation.json`, `evidence/nov06-refund-source-artifacts.json`. Four full native transport journeys, remaining supported-wallet capture, interrupted cases, account/link/draft/accessibility breadth and three provider blockers remain open.

## Earlier November 6 TEST continuation

| Check | Result | Evidence and limit |
|---|---|---|
| Actual refund of captured booking | OPEN | No refund issued. Delivered CHF10.50 is past automatic post-pickup cancellation. New unpaid furniture reservation only auto-refunds an exceptional late capture after cancellation/expiry; ordinary delayed authorization is an uncaptured hold. Earlier CHF8.92 release was not a refund. |
| Native Google Pay TEST | PASS authorization only | Genuine Google Pay TEST sheet; `pi_3UYszhClGb3s3rvz1kVvpyR5` `requires_capture` CHF10.50, received0, one uncaptured charge. DB `PAYMENT_HELD`/`CONFIRMED`, settlement `AUTHORIZED`/collected0/refunded0, wallet ledger0. Two countdown retries reused the intent. Capture/full trip and webhook delivery remain open. |
| Native additional-charge 3DS | PASS scoped capture/retry | TEST 3184 first failed off-session. On-session patch reused `pi_3UYtB9ClGb3s3rvz0bslwJ1u`, displayed Stripe 3DS2, captured CHF1 once. DB `CAPTURED`, one paid charge, direct-card wallet ledger0, no in-progress trip earning yet. Two authenticated retries returned409, unchanged state. Provider event retrieved; receiver delivery for this event unobserved. |
| Draft / remaining journeys | PARTIAL | Vehicle VIN survived ordinary process stop/re-entry. Four full native transport journeys, interrupted cases, account/link races, photo/full-draft and broader language/accessibility remain open. |
| Final checks / restoration | PASS scoped | API build and 94 suites/1182 tests; customer typecheck and 97/696 tests; isolated HTTP/worker/local signed-webhook smoke. Both original Dev preferences restored byte-for-byte (`resume-20261106-d.json`), USB mappings/font1.0 verified. Dev APKs unchanged, Metro bundle hash unavailable; signed release separate. |

Evidence: `evidence/nov06-googlepay-additional-sca-dev.json`, `evidence/nov06-additional-sca-retry.json`. Exact tested source HEADs/patch digests are in the first file. Prior accepted WebSocket, RTL and logout checks were not repeated.

## Later November 6 continuation (current delta)

| Check | Result | Exact scope / boundary |
|---|---|---|
| Retained isolated API, workers and webhook controllers | PASS local | Four services healthy; API rebuilt at `551f62e5a6529b63fe1ee0c1a1a1adfa8149073a`, isolated API restarted with official TEST CLI listeners ready; full smoke consumed both worker sweep jobs and passed locally signed webhook replay/negative checks. No business-event provider delivery inferred. |
| Stripe TEST read-only account and existing finance | PASS read-only | TEST preflight authenticated; `native-dev-capture` fixture actually CANCELLED, CHF1.58 captured cancellation fee and CHF8.92 uncaptured reserve released, CHF0 refunded. Additional expense CHF1.00 captured, CHF0 refunded. `native-dev-cancellation` remains QUOTED/no hold. See `nov06-finance-after-resume-readonly.json`. |
| Delivered full capture | PASS scoped Dev/backend/Stripe TEST | Customer Dev accepted the offer, made a real CHF10.50 authorization, reviewed current payment rules and confirmed delivery. Synthetic-coordinate/backend pickup and delivery proofs are excluded from native journey acceptance. Connected intent `pi_3UYsN0ClGb3s3rvz07exF517` captured CHF10.50 once, CHF0 refunded; DB hold `PAYMENT_CAPTURED`, settlement `COLLECTED`, genuine Connect succeeded webhook201, repeated confirmation one charge. See `nov06-synthetic-coordinate-delivery-capture.json`. |
| Actual captured-payment refund, supported wallets, additional SCA, remaining interrupted recovery | OPEN | Captured delivered trip is past automatic cancellation; no refund was issued. Prior CHF8.92 uncaptured reserve release is not a refund. Other provider/DB/ledger/worker/webhook journeys remain required. |
| Four complete transport journeys and rating | OPEN | Driver Dev reached Accepted Job but pickup stopped at native GPS unavailable on synthetic Basel route. Real backend endpoints accepted synthetic-coordinate/proof completion and customer Dev submitted 5-star rating; this does not complete any native transport journey. Restricted Routes key remains blocked. |
| Remaining links, account switching, draft/photo/repeat route, broad language/a11y | OPEN | Both synthetic Dev logins completed after USB reconnection. Remaining link, race, restoration and accessibility combinations were not closed. Earlier scoped WebSocket/RTL/logout checks retained without repetition. |
| Dev restoration | PASS | `resume-20261106-c.json`: current original preference archives restored byte-for-byte for both Dev apps, sign-ins retained, original USB mappings restored; all backup/volume/financial history retained. |
| Newer source regression | PASS targeted | Customer `286e0af7d2b5045722e2ce876e74aa8ae94f6a1a`: 4 suites/17 tests, type/privacy exit0. Driver `dc592d52ef58cd9c3fa4fc53aca78cdbc0bec42b`: 1 suite/4 tests, type/privacy exit0. API head above: 5 suites/139 tests, build exit0. Focused lint all three exit0. These are not new APK or signed-RC acceptance. |
| Three provider prerequisites | BLOCKED | Routes Google403 `API_KEY_IP_ADDRESS_BLOCKED`; Expo existing-key source/target FCM403 `IAM_PERMISSION_DENIED`; staging Twilio/destination unconfigured. Exact owner actions and verification are in `PRODUCTION_READINESS_REPORT.md`. |

Installed Dev APK hashes remained customer `2d8e6f43b18273d91cf112bdf1dcee8310c17ebdae3bcea5ee2c0406afed4c4c` and driver `565dd394a8245805898ee9cdbe3e03d50748d9554d297c89980deb353f75b35d` in the retained manifest. This session did not capture a contemporaneous Metro bundle hash; only the scoped Dev observations above are accepted. Signed Android RC and iOS/APNs remain separate. The observed payment-policy 409/consent path has a new API regression test (delivery-confirmation suite 8/8).

## November 6 Dev delta (current; prior rows below remain historical)

| Check | Result | Exact scope / remaining work |
|---|---|---|
| Native sender WebSocket text post-commit loss/restart/retry | PASS | Actual socket closed; native ordinary kill; same op1row/1event; new op separate |
| Native attachment post-commit loss/restart/retry | PASS | HTTP upload + active WebSocket events, one message/file/event; not WS upload |
| Delayed private file after logout | PASS both Dev apps | Driver before/after; customer separate seeded read fixture, released200 after logout, no viewer/cache; both apps deferred regressions; first timeout not accepted |
| Account switching | PARTIAL | Native customerA→B/consent/wrong-owner403; driver late200 refresh after logout remains Login; refresh/profile/storage/response regressions; full native A→B late-success and other overlaps OPEN |
| Arabic normal restart | PASS scoped Dev | Current customer/driver APKs mirrored without force-stop; iOS/signed RC OPEN |
| Direct-link lifecycle matrix | PARTIAL | Prior owned cold/login/consent plus native B403; driver background/normal-kill/logged-out-login owned link and Bwrong-owner404 passed; remaining combinations OPEN; never push acceptance |
| Extra charge capture/lost success/restart | PASS scoped | Same TESTPI, native4242, CHF1, one successfulcharge; additional SCA3184 OPEN |
| Cancellation fee/reserve release | PASS scoped | Native cancellation CHF1.58captured/8.92released, canonical provider/DB/settlement; true refund/bank payout OPEN |
| Cancelled additional history/dialog | PASS scoped | Captured expense retained and footer reachable after scroll |
| Direct-policy wallet | PASS guard only | Unsupported topup hidden/directroute guarded; wallets not accepted |
| Vehicle draft save/process restore | PASS sampled / broader OPEN | SDK56 move/copy race fixed, before2fail/after; native typedvalue persisted after ordinary kill/re-entry; photos/full draft/account overlap OPEN |
| Connection versus ownership copy | PASS fix | Native exact GET socket drop shows connection diagnostic; recovery clears it; HTTP403/404 regressions remain distinct |
| TalkBack Login speech | PASS sampled human observation | Owner reported speech/announcements correct and finished tutorial; broader tasks/swipe order OPEN; original settings restored |
| Original Dev/device restoration | PASS | All original preference bytes/SecureStore hashes, font/accessibility and USB mappings verified; volumes retained |
| Saved repeat route | PASS sampled | Goods details retained; prior Basel addresses/2.15km reused, no new provider routing |
| Languages/large text/keyboard | PARTIAL | Six selections both Dev apps/font1.3/Arabic RTL; font1.0 restored; human review/full forms/TalkBack OPEN |
| Automated final | PASS | Customer96/694, driver87/558; type/privacy/focusedlint; APIunit1176/HTTP21/payments271/build; realworker/webhook smoke |
| Maps/Routes/GPS | BLOCKED | Actual403 API_KEY_IP_ADDRESS_BLOCKED; no restriction edits/movement acceptance |
| Expo push / SMS | BLOCKED | Existing-key source/target IAM mismatch; Twilio unconfigured; no simulated PASS |
| Full delivered capture/refund/confirmation/four journeys | OPEN | Cancellation and additional capture do not close these journeys |
| Signed Android RC / all iOS gates | OPEN / NOT RUN | Current results are Dev Android only |


## Retained November5 record (historical)

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

## Current continuation after repository commits

The prior acceptance above remains tied to its original APKs. New RTL/request-link code and regression tests were prepared; physical verification is **BLOCKED** because device7925f75a disappeared from ADB after initial identification (Xiaomi2107113SG, Android14). No new device acceptance PASS is recorded. Recent Transpo24 activities were `.dev`; their backend/session scope could not be established before disconnect, so they were preserved and not used for financial testing.

Full isolated compose/worker/webhook smoke and read-only Stripe TEST preflight pass again. Official TEST forwarding is restored; separate endpoint secrets and sustained delivery remain open. The existing Expo/Firebase wrong-project IAM blocker is unchanged and no credential/permission modification was attempted. SMS and restricted staging Maps remain unconfigured for acceptance. GPS movement is not requested until its prerequisites are ready.

New `resume-chat-http.json` records genuine full-API HTTP acknowledgment loss/replay for text and attachment, a fresh Node replay process, one row/event/file as applicable, separate identical-text/new-ID behavior,409 conflict, and private file200/403/401 checks. This does not close native process/socket/attachment/file-opening acceptance. Final test counts, exact revisions, dirty-source hashes and local APK hashes are in `resume-summary.json` plus mobile `resume-artifact.json` / `resume-source-manifest.json`. New APKs require installation and affected-flow retests; older physical results do not transfer.

Still required physically: normal in-app Arabic↔LTR switch/reload; cold/warm/logged-out request links through consent; account changes during refresh/navigation/draft/file operations; text/attachment loss+restart; remaining TEST financial reconciliation and four complete service journeys; draft/repeat route/private opening; all six languages, large text, keyboard and TalkBack. iOS remains separately NOT RUN/BLOCKED.

Final validation: customer94 suites/680 tests; driver85 suites/550 tests. Both final typecheck/privacy and focused lint checks pass; corrected test-only type/lint declarations were rechecked with focused tests. Both final APKs assembled and passed package/signature/loopback/OTA checks, with no scanned server-secret/live-publishable patterns. Neither final APK was installed: ADB still reports no device. The customer final packaging attempt initially exhausted a2GiB Gradle heap; the retained failure log is separate from the successful retry using3GiB in the temporary build only. Final artifacts/hashes and source matches are in the mobile `resume-artifact.json`/`resume-apk-scan.json` files. Ignored `.log` outputs have matching `resume-*.txt` copies for durable evidence. All four dedicated containers were healthy at final inspection; the official TEST forwarder remained running. No real funds, non-synthetic user-data edits, deployments, pushes or publications occurred.
