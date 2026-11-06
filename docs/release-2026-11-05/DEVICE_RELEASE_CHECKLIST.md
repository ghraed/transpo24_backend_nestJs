# Device continuation — 5 November 2026

## November 6 captured-refund acceptance (latest)

- [x] Actual full refund of an owned synthetic **captured** CHF10.50 Stripe TEST direct charge through the authenticated admin application API. Stripe refund `re_3UYsN0ClGb3s3rvz0INYYwqw` succeeded; connected charge refunded CHF10.50 and platform application fee CHF2.00 refunded. This is separate from the earlier uncaptured CHF8.92 reserve release.
- [x] Reconcile provider, database, wallet ledger, settlement, payout history, genuine Connect `charge.refunded` webhook201, admin refund reconciliation MATCHED, worker sweep and two duplicate API retries with exactly one provider refund. Customer-role call403. Keep driver PAID_OUT history and settlement manual-review flag for direct-charge/bank-payout follow-up.
- [x] Add guarded admin review route/form, reason/amount check, stable idempotency, provider retry reconciliation, non-destructive review fields and regression tests. Admin UI optimized build/typecheck passed; an admin browser click was not performed. No deployment or signed-release test.
- [ ] Complete four native transport journeys, remaining wallet capture/interrupted cases, account/link races, broader draft/language/accessibility and provider prerequisites. Existing accepted WebSocket, RTL and logout checks were not rerun.

Evidence: `nov06-admin-reviewed-captured-refund.json`, `nov06-admin-refund-final-reconciliation.json`, `nov06-refund-source-artifacts.json`. API 95/1185 tests, build, Prisma validate and isolated worker/webhook smoke passed. The phone's original Dev settings, USB mappings and font scale remain restored; backups/volumes retained.

## Earlier November 6 physical TEST delta

- [x] Customer Dev used genuine Google Pay TEST sheet for synthetic CHF10.50 booking authorization; connected Stripe hold remains uncaptured, DB/settlement/ledger reconciled and duplicate countdown calls reused one intent. Full delivery/capture remains open.
- [x] Fixed saved-card additional-charge SCA: on-session confirmation, same connected PaymentIntent, native Stripe 3DS2, CHF1 captured once. TEST 3184 and two authenticated duplicate retries were physically/provider/API checked; provider-origin webhook delivery for this new payment is still open.
- [x] Sampled vehicle VIN draft after process restart; broader photo/draft/accessibility cases remain open.
- [x] Restored original customer and driver Dev preference archives byte-for-byte (`resume-20261106-d.json`); verified USB3001→3001,8081→8081,8082→8082 and font1.0. Synthetic state/backups/volumes retained.
- [ ] True refund of a captured payment through an eligible supported flow. Normal furniture reservation cancellation releases an uncaptured authorization; post-pickup delivered payment requires manual review. No actual refund acceptance yet.
- [ ] Provider-origin webhook replay for these new Google Pay/SCA intents, complete interrupted cases, four native transport journeys, remaining links/account races and broader language/accessibility.

See `evidence/nov06-googlepay-additional-sca-dev.json` and `evidence/nov06-additional-sca-retry.json`. API 94/1182 and customer 97/696 tests, API build, customer typecheck and local worker/webhook smoke passed. Installed Dev APK hashes are unchanged; live Metro bundle bytes were not captured. Signed release and iOS acceptance stay separate.

## Later November 6 device attempt and safe restoration

- [x] Verify retained Dev APK identities from `nov06-installed-dev-artifacts.json`; no reinstall or signed-RC run. Source heads: customer `286e0af7d2b5045722e2ce876e74aa8ae94f6a1a`, driver `dc592d52ef58cd9c3fa4fc53aca78cdbc0bec42b`, API `551f62e5a6529b63fe1ee0c1a1a1adfa8149073a`. No contemporaneous Metro bundle hash for this attempt.
- [x] Archive current original shared preferences before synthetic isolation; after USB reconnection, restore both archives byte-for-byte, original sign-ins and USB3001→3001/8081→8081/8082→8082. Synthetic preferences, original backups, retained volumes and financial history remain intact. Latest private restoration record: `.staging-local/dev-preservation-20261106/resume-20261106-c.json`.
- [x] Recheck four healthy isolated services, official TEST CLI listener readiness, read-only TEST key/account, real booking/payout worker consumption and locally signed webhook smoke after isolated API restart. Shared CLI signing secret and provider-origin business delivery remain separate gates.
- [x] Complete synthetic customer and driver Dev review-code login after USB reconnection; earlier dropped-USB/incomplete-code attempt remains historical. Remaining logged-out owned-link consent and wrong-owner combinations are still open.
- [x] Complete scoped delivered full Stripe TEST capture: real Dev offer acceptance/hold, backend synthetic-coordinate pickup/delivery, Dev customer policy consent/confirmation, CHF10.50 captured once, genuine Connect succeeded webhook201, repeat confirmation same charge. Synthetic GPS/proof means no full native journey PASS. Evidence: `nov06-synthetic-coordinate-delivery-capture.json`.
- [ ] Complete a true refund of an already captured payment. Existing cancelled fixture received CHF1.58 cancellation fee and released CHF8.92 uncaptured reserve, CHF0 refunded; newly delivered capture also has CHF0 refunded. Do not call either release a refund.
- [ ] Complete supported wallets, additional SCA, interrupted-payment retries and all four customer→driver offer/booking/pickup/delivery proof/completion/rating journeys; reconcile provider IDs, database, ledger, workers and provider-origin webhooks with no duplicate operation.
- [ ] Finish remaining account races, logged-out link lifecycle, broader draft/photo/repeat-route and language/accessibility checks when the USB connection is stable. Routing, push and SMS exact boundaries/actions are in `PRODUCTION_READINESS_REPORT.md`.

This attempt exercised Dev Android only. Driver Accepted Job stopped at native GPS unavailable on the synthetic Basel route; generated backend proof does not close it. Customer submitted a synthetic 5-star rating after confirmation. Earlier accepted WebSocket chat, RTL and logout samples were not repeated; signed Android release-candidate and iOS acceptance remain separate. Installed Dev APK hashes are recorded above, while contemporaneous Metro bundle bytes were not captured.

## November 6 current Dev checklist

Use `nov06-installed-dev-artifacts.json` for current hashes and the November6 source manifest for Metro/backend bytes. Historical staging hashes below are not current Dev acceptance.

- [x] Verify connected Xiaomi7925f75a/Android14; preserve both original Dev sign-ins privately, original preference hashes, existing volumes and old evidence.
- [x] Resume retained full AppModule/isolated PostgreSQL+Redis, real workers/proxy, TEST forwarder and webhook processing; USB3001→57431 during synthetic testing.
- [x] Genuine native WebSocket text lost ACK/event + actual connection close; ordinary process restart/retry; one persisted operation/event; identical new operation distinct.
- [x] Attachment native HTTP upload + active WS event loss/restart/retry; one persisted file/message/event.
- [x] Fix private-file viewer-after-logout and stale feedback; physical retest in both apps (customer separate seeded read fixture), both-app regressions.
- [x] Fix deferred driver refresh/profile/storage and customer stale authenticated responses; native customerA→B/consent/wrong-owner403, driverB wrong-owner404, native fresh delayed200 refresh after logout stays Login.
- [x] Native TEST extra charge capture and lost-success process recovery; clone retry on same PI.
- [x] Native cancellation partial capture/release and provider/database/settlement reconciliation; preserve captured extra history.
- [x] Bounded additional dialog; unsupported wallet topup guard; literal-colon labels; vehicle draft SDK56 move/copy fix and sampled native process restore.
- [x] Current Dev normal Arabic RTL reload both apps; six language selections in both apps at font1.3; saved repeat-route sample.
- [ ] Remaining precise A→B refresh/navigation/draft/upload races; scoped logout/late-refresh and both private-file samples passed.
- [ ] Complete direct-link lifecycle/login/consent/wrong-owner matrix both apps; actual push separate.
- [ ] Delivered capture, true refund, additional SCA, supported wallets, delivery confirmation and remaining interruption recovery.
- [ ] All four complete transport/proof/completion/rating journeys.
- [ ] Broader draft/photo restoration, repeat routes, keyboard/large-text screens, TalkBack and human language review.
- [ ] Routing403/IP restriction decision and configured outdoor/background/locked-screen movement; no key/IAM edits authorized.
- [ ] Existing-key Expo source/target mismatch resolution; genuine delivered push receipts; approved SMS configuration/destination.
- [ ] Signed Android release-candidate verification and pending iOS/APNs/signing/device acceptance.
- [x] Original Nov6 Dev preferences restored byte-for-byte; original encrypted sign-ins retained; font1.0/accessibility and USB3001→3001/8081/8082 verified. Original fault controls restored; volumes/credentials/evidence retained.
- [x] Network/ownership message classification fixed and physically retested using actual exact-route socket loss/recovery.
- [x] Owner confirmed sampled customer Login TalkBack speech/announcements and finished tutorial; full navigation/a11y stays open.


## Retained November5 record (historical)

**NOT READY.** Only the scoped results below are accepted. Prior November 4 evidence remains unchanged and is not reassigned to the new full integration environment.

## Artifacts and environment

Physical Xiaomi 2107113SG (Android 14, arm64), separate `.staging` packages, local test signing, SDK56 / compile and target36, OTA disabled, loopback API through this task's USB reverse mapping. No production/dev package data or device security settings were changed. Optional Google APK-upload prompts were declined; no store upload or protection bypass occurred.

| Artifact | SHA-256 | Acceptance scope |
|---|---|---|
| Customer payment-tested 1.0.7 | `13eeb1f150136c454f9da53a7656637b1b75e4b4f653075e2d40c54a6405eaef` | Delayed checkout copy, staging callback, synthetic native Stripe TEST cases below |
| Driver chat-tested 1.0.10 | `23bcafcc8b02e85f43e1c0d3b1050a07c33fd5763c9a5ad439283ec7d55c08eb` | Physical HTTP text acknowledgment-loss/restart/retry, initial Italian sample |
| Driver catalog-tested 1.0.10 | `3a988d98fb4bdaf552845f91ac39c850061213d49adea7bfd7db560571e891a5` | Final catalog native Italian settings verified; chat acceptance remains scoped to its original artifact |
| Customer Firebase-enabled 1.0.7 | `a5347195f2069587a196716a22696b570f8533204f031ea21aa41004e7576d6c` | New clean staging Firebase native inputs; token registration/foreground send attempted, delivery failed downstream |
| Driver Firebase-enabled 1.0.10 | `861c2389a3cb7d8951fc70613dea00234fad59c02c72405782522ff87b154d08` | New clean staging Firebase native inputs; token registration/foreground send attempted, delivery failed downstream |

Both mobile `.staging-artifacts/2026-11-05` directories retain APKs; exact source manifests and artifact metadata are in their mobile evidence directories (customer also retains local artifact copies), including superseded customer assemblies. The payment-tested customer installed SHA matched its artifact at the time; the newer Firebase artifact has separate install/hash evidence. The driver source delta between chat-tested and final consists only of the six catalog JSONs. Installed final driver SHA is recorded separately after its native sample. The earlier payment/catalog APKs lacked Maps/FCM configuration. The two new Firebase-enabled APKs use only validated transpo24-staging clients and still lack Maps configuration; they are local arm64 audit/acceptance artifacts, not production or store builds. Their asset scans are pattern checks, not complete secret audits. Rebuild again for approved provider configuration/signing.

The backend is the real AppModule with production HTTP configuration, 77 fresh migrations in dedicated PostgreSQL, dedicated Redis and genuine embedded booking/payout workers. No limited UI fixture server or provider overrides were used. Synthetic catalog, quote, driver eligibility and document records are explicitly seeded; this does not establish onboarding, document authenticity, routing, wallet funding or a complete journey.

## Native results

| Check | Result | Evidence / boundary |
|---|---|---|
| Customer review login and consent | PASS scoped | Generated private review code, no SMS; explicit terms and full payment-rules scrolling/acceptance, persisted across APK update. Not existing-user/fleet migration acceptance |
| Driver review login / Italian settings | PASS sample | Generated review code, no SMS; sample exposed 39 source keys missing from English, now filled in all six catalogs. Human Italian review remains open |
| Delayed checkout | PASS sample | Final APK shows Confirm offer, ten-minute free window, no funds reserved during setup, saved TEST card guidance and Total amount; native XML under evidence/device |
| Native 3DS approval | PASS scoped | `native-3ds-approve-retry`: explicit Stripe TEST challenge COMPLETE; same PaymentIntent becomes requires_capture, CHF1050 minor units capturable, zero received; real worker reaches CONFIRMED/PAYMENT_HELD and assigns driver |
| Native 3DS cancellation | PASS scoped | `native-3ds-cancel-retry`: explicit TEST challenge CANCEL; app shows cancelled without a fee; DB CANCELLED/PAYMENT_RELEASED, no driver assignment; provider canceled, zero capturable/received |
| Termination before provider success | PASS scoped | Force-stop recorded while requires_action; restart/warm request restoration, native 3DS COMPLETE, same intent reaches CONFIRMED/PAYMENT_HELD and assignment, zero captured |
| Termination after provider success | PASS scoped | Observed requires_capture, force-stop at 11:25:26.870 UTC while DB still ACTION_REQUIRED/unassigned; real worker confirmed at 11:25:27.279; restart displays Funds reserved, same intent, zero captured |
| Chat post-commit acknowledgment loss | PASS driver HTTP text | Deliberately dropped committed POST response, one DB row before force-stop; app restart, two deliberately stale history snapshots, restored pending composer, native retry returns same operation/message ID and DB1, composer clears |
| Android Firebase token registration | PASS scoped | Both new APKs register android/STAGING with exact package identity. Driver notification permission granted by ADB; native prompt path not accepted |
| Android foreground delivery | FAIL / BLOCKED | Both genuine native test sends get accepted Expo tickets but receipts fail FCM403 SERVICE_DISABLED for transpo24; zero active staging notifications observed. See push receipt files and firebase-device-artifacts-and-notifications.json |
| Android background / normal termination | NOT RUN | Foreground provider gate failed. No local notification or direct FCM substitute is accepted |
| Chat sockets / attachments / customer native replay | OPEN | Proxy deliberately blocks WebSocket and polling; driver text case does not cover these paths |
| Stripe-originated delivery | PASS Connect scoped | Actual failure/cancellation/amount_capturable_updated events returned 201 at genuine Connect endpoint; filtered IDs/types and provider-origin verification retained. Local generated signatures remain separate evidence |
| Runtime resilience | OPEN | Local API/proxy/CLI processes exited during acceptance; interrupted case retained, transport restored and clean cancellation repeated. Exact cause not established; periodic safe heartbeat/exit tracking did not establish stability. API/embedded workers and proxy were then moved to a digest-pinned local Node container stack, all four services healthy, full smoke repeated, final after-success termination/reconciliation passed there. Sustained resilience and CLI reconnect behavior remain open; no production resilience claim |
| Arabic runtime switching | OPEN observation | Arabic text updates, but the announced automatic reload does not mirror layout until manual force-stop/restart; mirrored post-restart job-list/tab sample retained. Final staging preference is Arabic; no device-wide language change |
| Cold deep-link restoration | OPEN observation | Multiple cold starts after auth restoration fell back to Home; the same owned request opens via a warm deep link. Reproduce/fix on provider-enabled final builds before accepting terminated push/deep links |

The first native authorization attempt failed because the Connect card clone was consumed by off-session SCA failure and then reused. Provider events and failure are retained. The API fix reclones the owned platform card, keeps the same intent/account/attempt keys, and resumes canonical authentication-required state after a lost worker response. A real StripeService probe plus regression cases and the later native approval validate this path. Earlier unit mocks incorrectly allowed reusing the consumed clone; the test now requires a fresh clone. This is a new finding/fix, not a silent promotion of the failed run.

An earlier cancellation attempt overlapped a local transport/process interruption, then the bank deadline elapsed. It ultimately cancelled without assignment/capture, but that is deadline/recovery evidence, not clean native cancellation acceptance. Its original records remain intact; the clean retry above is separate. Expired unaccepted synthetic quote pickup/delivery estimates were refreshed before the remaining cases; no authorization/financial status was seeded.

The official Stripe CLI v1.55.8 archive checksum was verified. Listeners use the existing explicit TEST key, private configuration and loopback forwarding only; no live funds, Dashboard endpoint deployment or account business changes. Both CLI scopes returned the same signing secret. Independent deployed platform/Connect secrets, platform business delivery, capture/refund/fee/payout/dispute journeys and durable delivery/reconciliation remain release gates. A native authorization is not a completed delivery or capture test.

`native-payment-final-proof.json` enumerated the complete connected TEST account intent list and found exactly one PaymentIntent and one DB hold per six owned cases, all with amount_received=0. `stripe-origin-event-verification-final.json` verifies ten actual delivered events against Stripe. This is identity/no-capture evidence, not delivery/capture/fee/payout acceptance.

## Exact blocked work and prerequisites

| Required acceptance | Missing prerequisite / exact next action |
|---|---|
| Outdoor, background and locked-screen GPS | Enable native GPS/location permissions (the final driver job list requests them); a person carries the unlocked/then-locked staging phone on a safe outdoor route, timestamps conditions, and maintains a reachable isolated API path. Current USB loopback is unsuitable for an untethered route. Verify real native fix timestamps and receipt ordering; simulated fixes/unit tests do not close this |
| Real Maps/routing | Approve staging Maps SDK keys restricted to both `.staging` package names and the recorded local signing SHA-1s; enable/bill required SDKs. Server Routes/Places/Geocoding key requires staging IP/API restrictions; existing key strings have unverified ownership/restrictions. iOS keys must be staging bundle restricted. Clean provider-enabled rebuild required |
| SMS | One destination controlled by the user plus confirmation that the selected Twilio Verify test/staging account/service permits it (trial verification/geo permissions as applicable). Runtime SMS credentials are intentionally absent. Review-code login proves no delivery |
| Android foreground/background/normal-termination push | Registrations, private files, rebuilt APKs and owner-approved Expo FCM V1 assignments are now present. Both apps registered STAGING tokens; genuine foreground receipts fail FCM403 SERVICE_DISABLED in the reused key source project transpo24. The API was enabled; later retries fail IAM_PERMISSION_DENIED on projects/transpo24. The owner requires reuse of the existing key; a supported Expo staging-target route and device foreground/background/normal-termination evidence remain missing. Do not infer delivery from tickets |
| iOS signed acceptance / APNs | Mac/Xcode compatible with SDK56, Apple team, staging bundle IDs/profiles/entitlements, registered test iPhone, APNs credentials and signed staging artifacts. Linux host has none available; an iOS Firebase plist alone is not the APNs prerequisite |
| Complete customer/driver journeys | Provider-enabled builds, real request creation/selection through completion with synthetic accounts, onboarding/docs, driver pickup/delivery proof, wallet/capture/refund/payout paths and receipt reconciliation. Seeded eligibility/quotes are not those journeys |
| Account switching | Second synthetic identity per role, logout/family revocation, cache/outbox/push scope and restart isolation on final builds. Unit coverage is not complete physical acceptance |
| Six languages / RTL / accessibility | Human Italian linguistic/legal review; all six complete flows, Arabic RTL, large text, TalkBack/VoiceOver names/focus/order/announcements and visual contrast. Automated AST/key/placeholder parity is structural only |
| Release operations | Dependency gate DEP-01 remains OPEN; compatible enforced cutover/bridge, backup/uploads restore RPO/RTO, alerts, OCR/dedupe/reconciliation and operator rollback evidence remain required |

Do not send secret contents in chat. The owner completed the separate staging Firebase files and approved the existing-key upload for both staging apps. Production assignments were verified unchanged. The source API was enabled and subsequent attempts fail a different IAM check for the wrong project. The owner requires the existing key; see OWNER_ACTIONS.md. Preserve both failed receipt sets.

## Cleanup and resume

Financial-phase owned TEST cleanup cancelled all six intents with zero captured funds, retaining financial/provider history and the synthetic TEST customer/card. Synthetic sessions were revoked directly (zero active afterward), availability disabled, and both staging apps force-stopped. This is not native logout or account-switch acceptance. The financial-phase installed hashes match the earlier artifact rows; new Firebase APK installation is recorded separately. Container restart smoke passed; shutdown/status records are indexed in EVIDENCE_INDEX.md. Retain synthetic database/provider history, original reports, artifact/source hashes and diagnostic failures. Cancel/refund only owned TEST objects, revoke only synthetic session families, force-stop only staging apps, remove only this task's USB reverse mapping, stop only this task's API/proxy/CLI and dedicated compose services, and retain volumes/private ignored configuration for repeatability. Never delete the prior connected TEST account.

The previous push-phase shutdown is recorded in `push-phase-final-runtime-state.json`. The latest existing-key retry cleanup is recorded in `existing-key-retry-synthetic-cleanup.json` and `existing-key-retry-final-runtime.json`: zero active synthetic sessions/tokens, synthetic availability offline, own USB mapping removed and all four owned containers exited0. Both staging packages were force-stopped; the customer stop flag later became false and may indicate it was reopened. Volumes/configuration/evidence and owner-approved Expo assignments are retained; the reused Google key was not revoked. First cleanup helper referenced a nonexistent model after session/token cleanup, then was corrected and rerun idempotently; initial failure is preserved. An initial shutdown verifier also matched a permission heading without state flags; the corrected exact-state check passed. No financial operations were repeated in the push phase.

## Update after source API enablement

The owner enabled the source-project FCM API. Fresh target-project validate-only remains HTTP200. Two separately labeled retries through genuine authenticated API ingress now fail with **FCM403 IAM_PERMISSION_DENIED**, permission `cloudmessaging.messages.create`, resource **projects/transpo24**. Thus the earlier SERVICE_DISABLED blocker cleared, but the current Expo route still targets the key's source project instead of **transpo24-staging**. Both failed receipts and zero own active notifications are retained. These retries used previously native-issued tokens and genuine API registration/test endpoints; they are not successful native foreground/background lifecycle acceptance. No direct FCM sender or fixture was substituted.

Google documents cross-project service-account use only when requests target the destination project endpoint. Our direct validate-only target check meets that condition; the observed Expo route does not. Expo's documented setup uses an FCM credential matching the app's Firebase sender. The owner confirmed the existing-key requirement; the previously suggested replacement-key action is canceled. No supported Expo target override was found, so push remains blocked under the existing configuration. Do not broaden messaging permissions in the source project to conceal the wrong target, rewrite the existing key's project metadata, or silently close push gates.

## Current continuation after repository commits

The prior acceptance above remains tied to its original APKs. New RTL/request-link code and regression tests were prepared; physical verification is **BLOCKED** because device7925f75a disappeared from ADB after initial identification (Xiaomi2107113SG, Android14). No new device acceptance PASS is recorded. Recent Transpo24 activities were `.dev`; their backend/session scope could not be established before disconnect, so they were preserved and not used for financial testing.

Full isolated compose/worker/webhook smoke and read-only Stripe TEST preflight pass again. Official TEST forwarding is restored; separate endpoint secrets and sustained delivery remain open. The existing Expo/Firebase wrong-project IAM blocker is unchanged and no credential/permission modification was attempted. SMS and restricted staging Maps remain unconfigured for acceptance. GPS movement is not requested until its prerequisites are ready.

New `resume-chat-http.json` records genuine full-API HTTP acknowledgment loss/replay for text and attachment, a fresh Node replay process, one row/event/file as applicable, separate identical-text/new-ID behavior,409 conflict, and private file200/403/401 checks. This does not close native process/socket/attachment/file-opening acceptance. Final test counts, exact revisions, dirty-source hashes and local APK hashes are in `resume-summary.json` plus mobile `resume-artifact.json` / `resume-source-manifest.json`. New APKs require installation and affected-flow retests; older physical results do not transfer.

Still required physically: normal in-app Arabic↔LTR switch/reload; cold/warm/logged-out request links through consent; account changes during refresh/navigation/draft/file operations; text/attachment loss+restart; remaining TEST financial reconciliation and four complete service journeys; draft/repeat route/private opening; all six languages, large text, keyboard and TalkBack. iOS remains separately NOT RUN/BLOCKED.

Final validation: customer94 suites/680 tests; driver85 suites/550 tests. Both final typecheck/privacy and focused lint checks pass; corrected test-only type/lint declarations were rechecked with focused tests. Both final APKs assembled and passed package/signature/loopback/OTA checks, with no scanned server-secret/live-publishable patterns. Neither final APK was installed: ADB still reports no device. The customer final packaging attempt initially exhausted a2GiB Gradle heap; the retained failure log is separate from the successful retry using3GiB in the temporary build only. Final artifacts/hashes and source matches are in the mobile `resume-artifact.json`/`resume-apk-scan.json` files. Ignored `.log` outputs have matching `resume-*.txt` copies for durable evidence. All four dedicated containers were healthy at final inspection; the official TEST forwarder remained running. No real funds, non-synthetic user-data edits, deployments, pushes or publications occurred.
