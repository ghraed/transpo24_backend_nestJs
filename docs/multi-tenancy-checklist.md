# CHECKLIST.md — Transpo24 Multi-Tenancy + Default-Allow Route Blocks

Use this checklist across API, client mobile, driver mobile and admin.

## Session checkpoint — 2026-09-24

M0 discovery, M1 tenant foundation and M2 request geography are implemented and
verified for the **additive compatibility phase**. The full multi-tenancy feature is not complete.
M3 and M4 are implemented (checkpoints below). M5 is implemented (checkpoint below). M6 is implemented (checkpoint below). M7 is implemented (checkpoint below). M8 is implemented (checkpoint below). M9 is implemented (checkpoint below). M10 is implemented (checkpoint below). M11 market authentication, coverage/request UI, offer flow and focused active-job regressions are implemented (checkpoints below); M11 core native lifecycle is verified; broader device/release acceptance remains in final acceptance. M12–M14 remain pending. **Next task: M12 — Security/performance**.

- [Implementation handoff and exact next task](multi-tenancy-progress.md)
- [Architecture and installed versions](multi-tenancy-discovery.md)
- [Migration, backfill and rollout settings](multi-tenancy-rollout.md)
- M2: server-resolved request country codes, customer/origin tenant separation,
  existing request currency reuse, all creation/edit/submission paths and responses.
  New migration: `20260924150000_add_request_geography`; no historical data guessed.
- M2 validation: **467 API tests / 43 suites with coverage**, **14 e2e tests**,
  **7 geography + 10 tenant PostgreSQL tests**, build, full TypeScript check,
  schema validation and changed-file lint passed. All **66 migrations** applied
  to disposable PostgreSQL; historical CHF price/status survived the M2 upgrade.
- Google provider responses were mocked. `REQUEST_GEOGRAPHY_REQUIRED=false` is
  the compatibility default; without a server key unresolved geography stays
  null. Configure/verify Google Geocoding before enforcement. M3 must prevent
  unresolved geography from bypassing route checks. M9 still needs request-currency
  enforcement on driver offers; mobile currency UX remains M10/M11.
- M1 migration: `20260924140000_add_tenant_foundation`; existing migrations unchanged.
- `User.tenantId` remains nullable during the additive rollout. Existing accounts
  require explicit reviewed backfill; no production assignments were guessed.
- `TENANT_AUTH_REQUIRED` defaults to false for old clients. Supplied markets
  always validate. Optional `LEGACY_REGISTRATION_MARKET_CODE` affects new legacy
  registrations only; unassigned existing accounts are never auto-transferred.
- Tenant-bearing HS256 JWT issuance is implemented/tested behind
  `ACCESS_TOKEN_FORMAT=jwt`. Default legacy issuance preserves the released
  customer app's segment-zero expiry decoder. Update that decoder in M10/M13
  before switching issuance; both formats are verified by the API.
- M1 validation (previous checkpoint): **435 tests / 42 suites passed with coverage thresholds**, **14 e2e tests
  passed**, **10 PostgreSQL integration tests passed**, build and schema validation
  passed. All 65 migrations applied to disposable PostgreSQL; an upgrade fixture
  confirmed existing user/session data survives. Changed-file lint passed.
- Full API lint still has 26 existing errors in unchanged chat/driver files.
- Customer and driver typechecks/privacy checks passed; mobile source unchanged.
  Customer Jest stalled and was terminated after >3 minutes. Driver baseline has
  2 failed suites (139 passed tests, 1 failed test): city-coverage test input and
  node:test fingerprint checks incorrectly collected by Jest.
- Admin unchanged: typecheck, 12 web-push tests and production build passed.
- No production deployment/backfill, mobile native build, commit or push occurred.
  Final acceptance and rollout checkboxes intentionally remain unchecked.

## M3 checkpoint — 2026-09-24

- Directional RouteBlock model/migration, central default-allow policy and
  publication/open-edit enforcement implemented. Existing creation endpoints save
  drafts; enforcement occurs when publishing, before write/dispatch.
- Active duplicate rules rejected by partial unique indexes, including null/all
  types. No cache or allowed-route records. Internal block reasons remain private.
- Unresolved countries cannot bypass checks, even in geography compatibility mode.
  A verified Google server geocoder is now required for publishing/open edits.
- 481 unit tests / 44 suites with coverage, 14 HTTP tests, 21 PostgreSQL integration
  tests (3 policy + 8 geography + 10 tenant), build, typecheck, schema validation,
  changed-file lint passed. All 67 migrations applied to isolated PostgreSQL 16.
- Accepted/in-progress lifecycle untouched. Admin API/auditing (M4), matching and
  offer checks (M7–M9) still pending. No production deployment/backfill or commit.

## M4 checkpoint — 2026-09-24

- Admin-only list/detail/create/patch/soft-delete and effective route-check endpoints
  implemented using existing authentication and ADMIN role guards.
- Country/type/reason/status validation, bounded pagination, directional/type/status
  filters and duplicate-active 409 errors (including reactivation).
- New additive `20260924170000_add_route_block_audits` migration: actor, timestamp,
  direction/type/reason/status before-and-after snapshots commit atomically with
  policy changes. Row locks preserve accurate prior state on concurrent updates.
- Shared policy lookup serves admin checks; internal reasons stay out of public errors.
- Validation: **499 tests / 45 suites with coverage**, **14 HTTP e2e tests**,
  **27 PostgreSQL tests** (6 admin + 3 policy + 8 geography + 10 tenant), build,
  TypeScript, schema validation and changed-file lint passed. All **68 migrations**
  applied to isolated PostgreSQL 16. No production deployment/backfill or commit.
- Progress: **125/316 checklist items (39.6%)**; M0–M4 complete for their stated
  implementation scope, M5–M14 pending. Counts are unweighted, not effort estimates.

## M5 checkpoint — 2026-09-24

- Verified existing M1–M4 code/contracts; **97 tests / 5 suites** passed for tenant
  auth/public markets, request geography, route policy and admin route-block HTTP.
  Completed API behavior was preserved; no schema/business-logic changes.
- Added the admin Route Blocks resource/menu and home entry, guarded list/create/edit
  pages, server pagination and origin/destination/type/status filters. Reuses the
  existing Refine custom-provider pattern, Axios auth and API ADMIN guards.
- Country names plus ISO codes, explicit direction/all-types labels, internal reason,
  timestamps and creator ID displayed. Create/edit/activate/deactivate require a
  review dialog showing direction/type and accepted/in-progress job warning.
- Duplicate-active 409 errors remain visible with retry; activation is audited via
  existing PATCH API. Reverse direction is explicitly unchanged, without claiming
  it is allowed when another rule may block it. No destructive delete/allow rows.
- Rollout warning explicitly identifies pending matching/offer enforcement (M7–M9).
  Specific-type list filters match the API exactly; helper text explains that
  all-type rules may also affect a route.
- Validation: admin TypeScript, changed-file ESLint, production build, **12 web-push
  tests**, and **7 browser scenario groups** passed. Browser API responses mocked;
  verified auth denial, pagination/filters, cancel/status/duplicate flows,
  create/edit/null payloads, same-country blocks, error/retry and mobile width.
  Reproducible script: `admin/Transpo_24/scripts/test-route-blocks-browser.cjs`;
  instructions: `admin/Transpo_24/docs/route-blocks.md`.
- Build retains existing multiple-lockfile and unrelated image-element warnings.
  No production changes, migration/backfill, commit or push. M6–M14 remain pending.
- Current progress: **145/316 checklist items (45.9%)**; counts are
  unweighted and do not indicate production readiness.

## M6 checkpoint — 2026-09-24

- Separate operational-country pickup/dropoff permissions and directional route
  permissions, approval statuses, uniqueness, indexes and additive migration.
- Driver-owned pending requests; ADMIN review with reviewer/time. Repeat requests
  cannot reset suspension/rejection or expand approved permissions.
- Explicit, idempotent home initialization uses reviewed Tenant assignment and
  creates PENDING rows. Foreign coverage is not auto-approved; GPS grants nothing.
- Shared approved-country/exact-route predicate prepared for M7 integration.
  Matching/offer enforcement remains M7–M9; mobile management remains M11.
- Validation: **515 API tests / 46 suites with coverage**, **14 HTTP e2e tests**,
  **30 PostgreSQL tests**, build, typecheck, schema validation and changed-file lint.
  All **69 migrations** applied to isolated PostgreSQL 16. No production changes.
- Current progress: **160/316 checklist items (50.6%)**, unweighted.
  M0–M6 implemented for their stated scope; next milestone is **M7**.

## M7 checkpoint — 2026-09-24

- Verified completed behavior with 30 M1–M6 PostgreSQL regression scenarios and
  the full API suite; continued from M7 without rewriting completed milestones.
- Reused `DriverRequestAlert` as the persisted RequestCandidate bridge, adding
  independent active/matched state and candidate/open-route indexes. Existing
  alerts remain inactive until authorized matching; unique request/driver upserts.
- Centralized current platform policy, approved operational countries/direction,
  driver state, vehicle/documents, capacity, radius, schedule and offer rules.
  Home tenant is not a matching boundary. Discovery requires an active candidate
  and current authorization; unrelated jobs remain hidden.
- Driver refresh pages only approved directions (100/page); discovery batches
  policy/approval reads. Existing selected-driver details remain available.
- Opt-in ID-only BullMQ worker reloads/locks current requests and respects blocks
  added before processing. Synchronous publication remains the default/fallback.
- Validation: **519 API tests / 47 suites with coverage**, **14 HTTP tests**,
  **38 integration scenarios** (30 existing + 8 matching, including isolated real
  Redis delivery), build, TypeScript and schema validation. All **70 migrations**
  applied to isolated PostgreSQL 16. New/changed code lint checked; existing driver
  nickname/formatting lint errors preserved. Full repository lint is not green.
- No production migration/backfill, deployment, mobile/admin changes, commit or
  push. Reviewed driver coverage is required before enforcing live matching.
  M8 notification delivery and M9 direct offer/currency/lifecycle checks remain.
- Details: [M7 contract and verification](request-matching.md).
- Current progress: **205/316 checklist items (64.9%)**,
  unweighted. Next milestone: **M8 — Socket/push targeting**.

## M8 checkpoint — 2026-09-24

- Verified prior API behavior and continued notification targeting without redoing
  M0–M7. Fixed account-ID/profile-ID socket room mismatch: authenticated drivers
  join the database-resolved profile room; customers retain account rooms.
- Socket and push delivery reload current request/candidate eligibility, policy,
  coverage and request state. Missing/inactive/dismissed candidates and existing
  offers cannot produce request notifications. No tenant-wide broadcast.
- Preserved offer/selection event contracts and participant targeting. Tested
  handshake spoofing, missing profiles, denied trip/chat joins and reconnect
  validation. Driver notification navigation already reloads details through API;
  blocked stale deep links are denied by the existing candidate authorization.
- Post-commit socket checks are awaited. Recipient errors fail closed and are
  isolated. Delivery remains best effort, with candidate-list recovery; there is
  no durable outbox or guaranteed push retry. See the delivery contract below.
- Validation: **527 API tests / 47 suites** (526 with coverage, plus one focused
  failure-isolation test), **14 HTTP tests**, **39 PostgreSQL/Redis scenarios**,
  API build, TypeScript and changed gateway/matching/notification lint passed.
  All 70 migrations applied only to disposable PostgreSQL 16; no schema change.
  Mobile deep-link code inspected, not device-tested. Existing unrelated lint
  issues remain. No production deployment/backfill, commit or push.
- [M8 delivery contract](request-notifications.md).
- Current progress: **223/316 (70.6%) complete; 93/316
  (29.4%) remaining**, unweighted. Next milestone: **M9**.

## M9 checkpoint — 2026-09-24

- Direct offers recheck active candidate/current eligibility and route policy
  within the existing locked request transaction. Generic ROUTE_BLOCKED and
  REQUEST_ACCESS_DENIED responses; no home-tenant equality requirement.
- Persist request currency; omitted/null currency derives from the request and
  conflicting/missing persisted currency fails closed. Price/ETA/version,
  accepted-alert and duplicate checks and customer notifications preserved.
- Real PostgreSQL FR-driver/CH-job flow verifies selection, pickup/delivery,
  photos, chat, tracking, approach alert, expenses, rating and earning/payout
  scheduling after a route block and candidate deactivation. GPS preserves tenant.
  Wallet persistence is real; notifications and payout queue are test stubs.
  Actual Stripe transfer, multipart uploads and device behavior are not claimed.
- Validation: **527 API tests / 47 suites with coverage**, **14 HTTP tests**,
  **7 new + 38 prior PostgreSQL scenarios**; one prior Redis scenario skipped.
  Build, TypeScript and schema validation pass. Existing driver-service lint
  errors remain; other changed TypeScript files pass. All 70 migrations applied
  only to disposable PostgreSQL 16; no production/schema/mobile/admin changes.
- [M9 offer/lifecycle contract](offer-lifecycle.md).
- Current progress: **250/316 (79.1%) complete; 66/316 (20.9%) remaining**,
  unweighted. Next milestone: **M10 — Client mobile**. No commit or push.

## M10 checkpoint — Client mobile (2026-09-24)

- Verified the existing backend with **527 tests / 47 suites**; preserved M0–M9.
- API-driven market selector with loading, empty/error/retry states and persisted
  explicit selection; phone login/registration, OTP verification/resend and password
  login carry market context. Trusted continuation rejects a different selected market.
  Removed/inactive saved markets are not silently selected. GPS grants no tenancy.
- Profile displays server-provided home market read-only. Existing place search and
  address submission remain unrestricted by home market; cross-border payload tests
  preserve coordinates/place IDs and never inject a tenant. API geography/currency
  survives request mapping; displayed financial amounts use API currency, with no
  invented USD/CHF for missing historical display currency. Wallet top-up's existing
  currency selection/payment behavior is unchanged.
- Stable error-code handling includes generic ROUTE_BLOCKED text (including vehicle
  submission), with internal reasons hidden, and actionable TENANT_MISMATCH text.
- Account changes disconnect sockets, clear owner drafts/photos, private document
  previews and translation cache, and remount navigation state. Stale refresh/fetch
  results cannot restore a signed-out account or retry with a new account's token.
  Explicit trusted-device continuation remains available by existing product design.
- Expiry decoding supports both released two-segment tokens and standard JWTs.
  No backend auth flags or production behavior were changed.
- Validation: **248 client tests / 45 suites pass**, TypeScript/privacy checks,
  changed-file ESLint and Android production JS/Hermes export pass. The existing
  `src/requests/edit-request.test.js` suite stalls (also observed before edits);
  full-suite runs were stopped and it was explicitly excluded from the passing run.
  Selector rendering and API/storage behavior use mocks. No physical-device,
  live-geocoder, native APK/AAB or payment-provider acceptance is claimed.
- Checklist: **264/316 complete (83.5%); 52/316 remaining (16.5%)**, unweighted.
  Next milestone: **M11 — Driver mobile**. M12–M14 and final acceptance remain open.
  No production deployment/backfill, commit or push.

## M11 partial checkpoint — Driver market authentication (2026-09-24)

- Verified existing backend: 527 tests passed before changes. Continued M11 without
  redoing M0–M10; completed only the first four driver checklist items.
- Reused the client market selector in the driver app with its own persisted key,
  active saved-market validation, loading/error/retry/empty states and explicit choice.
  Login/registration phone flows carry market through OTP verification and resend.
  Trusted continuation sends the selected market; mismatch preserves the saved
  credential and lets the driver correct the market. GPS does not select a market.
- Driver profile shows home market read-only. Fixed `/driver/me` and profile-update
  serialization to return the database tenant using the existing public serializer,
  independently of driver country preferences. Added stable generic route-block and
  actionable tenant-error messages; internal reasons are hidden.
- Validation: **528 API tests / 48 suites**, API and driver TypeScript, driver privacy
  checks, changed-driver-file ESLint, **15 focused driver tests / 3 suites**, and
  Android production JavaScript/Hermes export pass. Full driver regression run still
  has the two documented baseline failures: city-coverage fixture and node:test
  fingerprint suite collected by Jest (142 passing tests in that run, before adding
  12 further focused auth tests). No physical-device or native APK/AAB acceptance.
- Remaining M11: operational-country and directional route-permission UI/statuses,
  candidate job/geography/currency verification, graceful stale-job handling,
  cross-tenant offers and active-job lifecycle acceptance. Offer UI still derives
  currency from driver country and must be changed to request currency next.
- **268/316 complete (84.8%); 48/316 remaining (15.2%)**, unweighted.
  M11 remains in progress. No production changes, migration, commit or push.

## M11 partial checkpoint — Request currency and geography (2026-09-24)

- Read ROADMAP/DECISIONS/current CHECKLIST and verified the existing market-auth
  implementation. Continued M11 without redoing M0–M10.
- Driver request list/detail serialization now includes persisted currency and
  pickup/destination country codes. Historical missing values remain null.
- Request review displays directional country codes and request currency. Offer
  screen reloads the authorized request and uses its currency for price, fee,
  earnings preview and submission. Driver country and navigation currency cannot
  override it; unavailable currency or denied request access prevents submission,
  with an error and retry control. Removed outdated profile currency guidance.
- Validation: **530 API tests / 49 suites**, **17 focused driver tests / 3 suites**,
  API/driver TypeScript, driver privacy checks and changed-driver-file ESLint pass.
  New rendered offer tests cover FR driver/CHF request, missing/malformed currency
  and stale request denial. API test covers geography and null legacy currency.
  No physical-device, native-build, live-payment or full-driver-suite acceptance.
- **271/316 complete (85.8%); 45/316 remaining (14.2%)**, unweighted.
  M11 remains incomplete: coverage/permission screens and approval statuses,
  candidate discovery verification, broader stale-job handling, cross-tenant open/
  offer and active-job lifecycle acceptance remain. No deployment, commit or push.

## M11 partial checkpoint — Operational coverage screens (2026-09-24)

- Read ROADMAP, DECISIONS and current CHECKLIST; preserved completed work and
  existing uncommitted request geography/currency changes. Verified existing
  coverage authorization and request serialization with 18 backend tests.
- Added profile-linked operational-country and directional route-permission
  screens using the existing authenticated self-service endpoints. Country
  requests include pickup/dropoff flags; route requests preserve direction,
  including same-country routes. Neither submits tenant IDs or approval status.
- Display pending, approved, rejected and suspended decisions returned by the
  server. Repeat submissions retain the administrator decision. Loading, empty,
  refresh/retry and submission error states are included; stale loads are ignored
  on screen exit/account change. Country codes are entered as two-letter ISO
  codes and validated authoritatively by the existing API.
- Validation: 19 focused driver tests across 3 suites (5 new rendered coverage
  tests plus existing market-auth/currency checks), 18 API tests across 2 suites,
  TypeScript, privacy checks, changed-file ESLint and Android production JS/Hermes
  export pass. No physical-device or native APK/AAB acceptance is claimed.
- **274/316 complete (86.7%); 42/316 remaining (13.3%)**, unweighted.
  M11 still needs candidate discovery, cross-tenant opening/offer verification,
  broader stale-job handling and active-job acceptance. M12–M14 and final
  acceptance remain open. No deployment, migration, commit or push.

## M11 partial checkpoint — Candidate discovery (2026-09-24)

- Read the roadmap, locked decisions and current checklist; preserved completed
  milestones and pre-existing uncommitted currency/geography work.
- Verified API discovery requires an active driver candidate and current matching
  authorization. The mobile list uses the authenticated API without home-market
  filtering; cards open request details by ID for authoritative reload.
- Removed the list's invented CHF fallback, displayed API route country codes,
  and prevented a pending token read from subscribing after screen cleanup.
- Seven new rendered tests cover server-returned jobs, detail navigation, missing/
  invalid currencies, removal on refresh/deletion, and delayed socket setup.
- Validation: 530 backend tests / 49 suites, 17 focused driver tests / 3 suites,
  driver TypeScript/privacy checks and changed discovery-file ESLint passed.
  Mobile APIs are mocked; no device, native-build or live lifecycle acceptance.
- **275/316 complete (87.0%); 41/316 remaining (13.0%)**, unweighted.
  M11 remains open for cross-tenant detail/offer verification, broader stale-job
  handling and active-job lifecycle acceptance. M12–M14 and final acceptance
  remain open. No deployment, migration, commit or push.

## M11 partial checkpoint — Request detail recovery (2026-09-24)

- Continued the first incomplete milestone without redoing completed work.
- Verified request details reload by authorized request ID without a mobile home-
  tenant filter and continue to the same request's offer screen. Existing backend
  candidate authorization remains authoritative.
- Detail loading now clears prior data and ignores superseded responses. Failed
  acceptance clears stale details/actions and presents retry plus return to the
  request list; retry performs a fresh authorized load.
- Validation: 17 rendered driver tests across 3 suites (5 new detail tests),
  105 backend tests across 4 suites, driver TypeScript/privacy checks, changed-file
  ESLint and diff whitespace checks pass. Mobile API calls are mocked; no device,
  native-build, production or live lifecycle acceptance is claimed.
- **276/316 complete (87.3%); 40/316 remaining (12.7%)**, unweighted.
  Only cross-tenant request opening is newly checked. Broader stale-job handling,
  full offer-flow and active-job lifecycle verification remain open in M11.
  M12–M14 and final acceptance remain open. No deployment, migration, commit or push.

## M11 partial checkpoint — Stale offer recovery (2026-09-24)

- Verified existing discovery/detail recovery and backend eligibility, offer and
  route-policy behavior without redoing completed milestones.
- Offer submission now invalidates the loaded currency/submission permission when
  the server reports a removed, blocked, inaccessible or no-longer-approved job.
  Retry reloads authorized request details; failed reload keeps submission disabled.
  Both initial-load and submission denials provide a return to available requests.
- Validation: 23 rendered driver tests / 3 suites, including six new rejection and
  recovery cases; 106 backend tests / 4 suites; driver TypeScript/privacy checks,
  changed-file ESLint and diff whitespace checks passed.
- Marked removed/blocked request handling complete at automated-test level.
  Mobile APIs are mocked; full offer-flow and active-job lifecycle acceptance,
  native/device acceptance, M12–M14 and final acceptance remain open.
- **277/316 complete (87.7%); 39/316 remaining (12.3%)**, unweighted.
  No deployment, migration, commit or push.

## M11 partial checkpoint — Offer-flow regression verification (2026-09-24)

- Continued the first incomplete milestone, preserving completed implementation.
- Repaired three outdated offer-version tests whose API mock omitted the existing
  authoritative request reload. No application behavior changes were necessary.
- Added invalid-price, optional timing/message, pending-submission protection,
  network-failure retry and success-screen navigation checks. Verified request
  currency/version submission and changed-details recovery alongside existing
  cross-tenant currency, stale-offer, detail and discovery tests.
- Validation: **35 rendered driver tests / 5 suites**, **530 backend tests / 49
  suites**, driver TypeScript/privacy checks, changed-test ESLint and driver diff
  whitespace checks passed. Mobile APIs are mocked; no physical-device, native
  build, live offer/customer-selection or active-job lifecycle acceptance claimed.
- Marked driver offer flow complete at automated-test level. Active-job lifecycle
  verification remains the next M11 item. M12–M14 and final acceptance remain open.
- **278/316 complete (88.0%); 38/316 remaining (12.0%)**, unweighted, not an effort
  estimate. No deployment, migration, commit or push.

## M11 partial checkpoint — Accepted-job navigation and recovery (2026-09-24)

- Continued active-job verification without redoing completed offer/auth work.
- Accepted-job details now invalidate prior loads on focus cleanup/navigation,
  ignore superseded success/error responses, and clear prior job/map/photo state
  before reload. Failed loads offer a return to the accepted jobs list and retry.
- Added 13 rendered tests for seven pickup/delivery stages, three terminal states,
  denied-access recovery, stale job responses and late authentication failures.
  Verified server-authorized Swiss-job navigation and CHF display for an FR driver.
- Validation: **56 driver tests / 7 suites**, **38 backend trip/delivery/eligibility
  tests / 3 suites**, driver TypeScript/privacy checks, changed-file ESLint and
  diff whitespace checks passed. APIs and native components are mocked.
- Full active-job lifecycle remains unchecked: pickup/delivery action submission,
  proof photos, tracking, chat, expenses and payout still need mobile acceptance;
  no device/native-build or live-payment acceptance is claimed.
- Progress remains **278/316 complete (88.0%); 38/316 remaining (12.0%)**,
  unweighted. No deployment, migration, commit or push.

## M11 partial checkpoint — Trip submission verification (2026-09-24)

- Read roadmap, locked decisions and checklist; continued M11 without redoing
  completed features. Independently counted 278 completed and 38 open items.
- Added 11 driver service regressions for pickup/delivery proof uploads,
  authenticated request-specific delivery start, denied uploads, malformed
  responses, coordinate validation and explicit retry after network failure.
  Fixtures use a French driver and Swiss job; networking is mocked, so these
  tests verify mobile transport contracts, not live cross-tenant authorization.
- Validation: 38 driver tests / 4 suites (submission, accepted-job navigation,
  background tracking and chat socket lifecycle), 38 backend tests / 3 suites
  (trips, delivery confirmation and eligibility), driver TypeScript/privacy,
  changed-test ESLint and diff whitespace checks passed.
- Active-job lifecycle remains unchecked. Screen-level pickup/delivery actions,
  native proof-photo capture/upload, expenses, payout and live/device acceptance
  still need verification. M12–M14 and final acceptance remain open.
- Progress remains **278/316 complete (88.0%); 38/316 remaining (12.0%)**,
  unweighted, not an effort estimate. No deployment, migration, commit or push.

## M11 partial checkpoint — Expense-screen verification (2026-09-24)

- Read roadmap, locked decisions and current checklist; independently verified
  278 completed and 38 remaining items. Continued M11 without redoing completed work.
- Added 11 rendered expense-screen regressions: exact job ID and selected currency,
  receipt submission, server-returned total, invalid/missing inputs, missing trip,
  denied-access recovery, pending submission state, denied camera/library permission,
  cancelled receipt selection and proof removal. Existing application code unchanged.
- Validation: **35 driver tests / 3 suites** (expenses, trip submission, accepted-job
  details), **38 backend tests / 3 suites** (trips, delivery confirmation, eligibility),
  driver TypeScript/privacy checks, changed-test ESLint and diff whitespace passed.
- Mobile APIs and image picker are mocked; native receipt capture/upload, live
  cross-tenant authorization and live payments are not established by these tests.
  M11 active-job lifecycle remains unchecked pending remaining screen-level
  pickup/delivery, payout and device/live acceptance. M12–M14 remain open.
- **278/316 complete (88.0%); 38/316 remaining (12.0%)**, unweighted task count,
  not an effort estimate. No production deployment, migration, commit or push.

## M11 partial checkpoint — Pickup/delivery screen verification (2026-09-24)

- Continued the first incomplete milestone after reading roadmap, locked decisions
  and current checklist. Preserved completed implementation; no application code changed.
- Added 18 rendered pickup/delivery regressions covering exact foreign-job IDs,
  proof photos and trimmed notes, missing/cleared proof, camera/library permission
  denial, pending uploads, server denial and explicit retry, accepted-job access
  denial, pickup-before-delivery enforcement, delivery start, fresh delivery GPS
  distance checks and refusal to navigate on an unexpected pickup response status.
- Validation: **53 driver tests / 4 suites**, **38 backend tests / 3 suites**,
  driver TypeScript/privacy checks, changed-test ESLint and diff whitespace passed.
- API, location, photo picker and native components are mocked. These tests establish
  screen behavior and request contracts, not live cross-tenant authorization or
  native capture/upload. M11 stays open for remaining arrival/socket, payout and
  device/live lifecycle acceptance; M12–M14 and final acceptance remain open.
- Independently counted **278/316 complete (88.0%); 38/316 remaining (12.0%)**.
  This is an unweighted task count, not an effort estimate. No deployment,
  migration, commit or push.

## M11 partial checkpoint — Arrival/socket and payout recovery (2026-09-24)

- Continued M11 using existing pickup/delivery regression coverage. Added 34 tests:
  25 payout cases across the completed-trip screen and payout card, plus nine
  arrival/socket acknowledgement, request-isolation and cleanup cases.
- Reproduced and fixed duplicate payout release requests during prerequisite
  account loading, release attempts continuing after navigation, and previous-trip
  transfer results appearing on a new trip. Workflows now serialize status/release
  operations, invalidate pending work on focus cleanup and clear old trip results.
  Transfers already submitted to the API are not cancelled by navigation.
- Reproduced and fixed pickup/delivery socket listener leaks when location
  permission was denied or pending at unmount. Cleanup now owns subscriptions
  immediately; late callbacks cannot navigate after leaving the screen.
- Validation: **101 driver tests / 7 suites**, **61 backend tests / 5 suites**,
  driver TypeScript/privacy, changed-file ESLint and diff whitespace passed.
  Payout APIs, camera, location and sockets are mocked; no real funds were moved.
- `adb devices -l` reported no connected device/emulator. M11 native/live acceptance
  remains open for proof capture/upload, cross-tenant arrival/delivery, tracking,
  chat, expenses and payout. M12–M14 and final acceptance remain open.
- Progress remains **278/316 complete (88.0%); 38/316 remaining (12.0%)**,
  unweighted task count, not an effort estimate. No deployment, migration,
  commit or push.

## M11 checkpoint — Core physical-device lifecycle (2026-09-25)

- Verified current driver source on a physical Android 14 phone against an isolated
  real local API/database: FR market login, CH accepted job, CHF display, real GPS,
  arrival acknowledgement, native gallery pickup/delivery proof uploads and
  DELIVERED completion. Two proof records and 29 foreground location records persisted.
- Fixed a device-discovered duplicate delivery-start race; deferred-response test
  reproduced it and passed after the fix. Replayed successfully on the phone.
- Validation: **102 driver tests / 7 suites**, **61 backend tests / 5 suites**,
  driver TypeScript/privacy, changed-file ESLint and whitespace checks passed.
- Marked active-job lifecycle complete at automated + core native-flow level.
  This is not full release acceptance: camera launch was cancelled; background
  location, Firebase push, live chat/expense payments and successful Stripe payout
  were not verified on-device. No real SMS/payment or customer job was used.
- [Detailed device evidence and limits](multi-tenancy-device-verification.md).
  M12 security is next; M13/M14 and final acceptance remain open.
- **279/316 complete (88.3%); 37/316 remaining (11.7%)**, unweighted task count.
  Restored original phone location setting and removed added test gallery files.
  Isolated test API/Metro and fixture database retained for follow-up.
  No production deployment/migration/backfill, commit or push.

# A. Verify projects

- [x] API confirmed NestJS + TypeScript.
- [x] Prisma confirmed.
- [x] PostgreSQL confirmed.
- [x] Redis/Socket.IO/BullMQ locations identified.
- [x] Client app confirmed React Native + Expo.
- [x] Driver app confirmed React Native + Expo.
- [x] Admin confirmed Next.js + Refine.
- [x] Package versions recorded.
- [x] Auth modules located.
- [x] Prisma schema located.
- [x] Request/offer models located.
- [x] Driver models located.
- [x] Matching service located.
- [x] Socket gateway located.
- [x] Push service located.
- [x] Queue workers located.
- [x] Admin auth/permissions located.
- [x] Geocoding/country-resolution logic located.
- [x] Client state/persistence located.
- [x] Driver state/persistence located.

# B. Tenant foundation

- [x] Add/reuse `Tenant`.
- [x] Add stable tenant code.
- [x] Add country code.
- [x] Add currency.
- [x] Add timezone.
- [x] Add locale if useful.
- [x] Add active flag.
- [x] Add user tenant relation.
- [x] Add indexes/migration.
- [x] Seed dev/test tenants.
- [x] Prepare explicit production tenant backfill.
- [x] Prevent tenant editing from profile.

# C. Authentication

- [x] Public tenant endpoint exists.
- [x] Registration accepts market code.
- [x] Login accepts market code.
- [x] Wrong market returns `TENANT_MISMATCH`.
- [x] JWT contains tenant ID.
- [x] Refresh token preserves/revalidates tenant.
- [x] Socket auth uses JWT/server identity.
- [x] Raw client tenant cannot override server tenant.
- [x] FR through FR succeeds.
- [x] FR through LB fails.

# D. Request geography

- [x] Pickup country code exists.
- [x] Destination country code exists.
- [x] Customer tenant ID exists.
- [x] Origin tenant ID exists.
- [x] Currency code exists.
- [x] ISO alpha-2 normalization implemented.
- [x] Existing geocoder/place metadata reused.
- [x] Country names are not used as routing keys.

# E. RouteBlock database

- [x] Add `RouteBlock`.
- [x] Add from country.
- [x] Add to country.
- [x] Add optional transport type.
- [x] Add reason.
- [x] Add active flag.
- [x] Add creator if compatible.
- [x] Add timestamps.
- [x] Add indexes.
- [x] Add migration.
- [x] Equivalent duplicate active rule prevented/warned.
- [x] Null transport type means all.
- [x] Directionality preserved.
- [x] Same-country block supported.

# F. Route policy service

- [x] Central `isBlocked()` exists.
- [x] All-type block checked.
- [x] Type-specific block checked.
- [x] Any matching active block returns blocked.
- [x] No matching block returns allowed.
- [x] No allowlist fallback exists.
- [x] No DB row required for allowed routes.
- [x] Cache invalidation works if cache is used (not applicable: no policy cache).
- [x] Unit tests cover precedence.

# G. Request creation

- [x] Customer tenant derived from auth.
- [x] Pickup country resolved.
- [x] Destination country resolved.
- [x] Route block checked.
- [x] `ROUTE_BLOCKED` returned when blocked.
- [x] No block means request allowed.
- [x] Origin tenant resolved.
- [x] Currency persisted.
- [x] Request persisted.
- [x] Matching queued.
- [x] Same-country request works.
- [x] Cross-border request works.
- [x] Customer may create request outside home tenant.
- [x] CH customer can create LB -> LB.

# H. Driver coverage

- [x] Operational-country model added/reused.
- [x] Pickup permission exists.
- [x] Dropoff permission exists.
- [x] Approval status exists.
- [x] Driver/country uniqueness exists.
- [x] Home-country coverage initialized appropriately.
- [x] Foreign coverage is not auto-approved.
- [x] GPS does not grant permission.

# I. Driver route permissions

- [x] Directional route permission exists.
- [x] Approval status exists.
- [x] Unique driver/from/to exists.
- [x] FR -> CH differs from CH -> FR.
- [x] Pending/rejected/suspended do not authorize.

# J. RequestCandidate

- [x] Candidate model added/reused.
- [x] Request relation exists.
- [x] Driver relation exists.
- [x] Active state exists.
- [x] Unique request/driver exists.
- [x] Indexes exist.
- [x] Upsert is idempotent.
- [x] Access is request-specific only.

# K. Matching

- [x] Central eligibility service exists.
- [x] Driver active check.
- [x] Driver approval check.
- [x] Online check if applicable.
- [x] Request state check.
- [x] Current route-block check.
- [x] Operational-country check.
- [x] Directional driver-route check.
- [x] Vehicle/type check.
- [x] Capacity check.
- [x] Document checks.
- [x] Location/radius check.
- [x] Schedule check if applicable.
- [x] Existing-offer checks.
- [x] Driver tenant equality is NOT mandatory.
- [x] Cross-tenant candidate works.
- [x] Matching avoids global scans/N+1.

# L. Blocking existing open work

- [x] New request rejected immediately after block activation.
- [x] Open unassigned requests get no new candidates.
- [x] New offers denied after route becomes blocked.
- [x] Accepted/in-progress jobs continue.
- [x] Admin UI warns about this.
- [x] Queue worker rechecks current route block.
- [x] Stale queue job cannot bypass block.

# M. Socket.IO

- [x] Authenticated user rooms.
- [x] Authenticated driver rooms.
- [x] `requestNew` only to candidates.
- [x] Cross-tenant candidate receives event.
- [x] Ineligible driver receives nothing.
- [x] `offerNew` targets customer.
- [x] `offerRejected` targets participant.
- [x] `requestDriverSelected` targets participant.
- [x] Arbitrary room join denied.
- [x] Reconnect restores only authorized subscriptions.

# N. Push notifications

- [x] Candidate-specific request push.
- [x] No tenant-wide broadcast as authorization.
- [x] Deep link reloads through API.
- [x] Stale push cannot bypass current authorization.
- [x] Blocked route creates no new request push.

# O. Offers

- [x] Candidate/current eligibility checked.
- [x] Route policy rechecked.
- [x] Non-candidate denied.
- [x] Cross-tenant candidate allowed.
- [x] Request currency enforced.
- [x] Price/ETA validation preserved.
- [x] Customer event/notification preserved.

# P. Full job lifecycle

For selected cross-tenant driver:

- [x] Accept.
- [x] En route pickup.
- [x] Arrived.
- [x] Pickup complete.
- [x] Pickup photos.
- [x] En route delivery.
- [x] Delivered.
- [x] Delivery photos.
- [x] Extra expenses.
- [x] Chat.
- [x] Tracking.
- [x] Approach alert.
- [x] Payment release.
- [x] Rating.
- [x] No step fails only because tenants differ.

# Q. Client mobile — React Native + Expo

- [x] Fetch markets.
- [x] Market selection screen.
- [x] Persist selected market.
- [x] Send market on registration/login.
- [x] Handle `TENANT_MISMATCH`.
- [x] Show home market read-only.
- [x] Cross-border pickup/destination works.
- [x] Request outside home tenant works.
- [x] Handle `ROUTE_BLOCKED`.
- [x] Show generic unavailable message.
- [x] Display API currency.
- [x] No hard-coded currency symbol.
- [x] Logout clears private caches.
- [x] Account switching cannot leak prior data.

# R. Driver mobile — React Native + Expo

- [x] Fetch markets.
- [x] Market selection/auth.
- [x] Handle `TENANT_MISMATCH`.
- [x] Home market read-only.
- [x] Operational-country screen.
- [x] Directional route-permission screen.
- [x] Approval statuses displayed.
- [x] Candidate-backed available requests.
- [x] Pickup/destination countries displayed.
- [x] Cross-border route displayed.
- [x] Request currency displayed.
- [x] Cross-tenant request opens normally.
- [x] Removed/blocked request handled gracefully.
- [x] Offer flow works.
- [x] Active-job lifecycle still works.

# S. Admin — Next.js + Refine

- [x] Existing admin resource pattern inspected.
- [x] `Route Blocks` menu/resource added.
- [x] List page added.
- [x] Create form added.
- [x] Edit form added.
- [x] Activate/deactivate control added.
- [x] Origin filter.
- [x] Destination filter.
- [x] Transport-type filter.
- [x] Active/inactive filter.
- [x] Direction shown clearly.
- [x] All-types vs specific type shown.
- [x] Reason shown.
- [x] Timestamps shown.
- [x] Creator shown if available.
- [x] Duplicate active rule warned/prevented.
- [x] Confirmation explicitly states FROM -> TO.
- [x] Reverse route warning shown where useful.
- [x] Existing in-progress jobs warning shown.
- [x] Admin permission enforced.

# T. Admin API

- [x] List route blocks.
- [x] Create route block.
- [x] Update route block.
- [x] Activate/deactivate.
- [x] Delete/soft-delete following convention.
- [x] Effective route-status check endpoint/service.
- [x] Country validation.
- [x] Transport-type validation.
- [x] Reason validation.
- [x] Actor auditing.
- [x] Permission tests.
- [x] Directionality tests.
- [x] All-types precedence tests.

# U. Required route-policy tests

- [x] Empty RouteBlock table: FR -> CH allowed.
- [x] Empty table: CH -> LB allowed.
- [x] Empty table: LB -> LB allowed.
- [x] Add LB -> SY all-types block: LB -> SY rejected.
- [x] SY -> LB remains allowed.
- [x] LB -> FR remains allowed.
- [x] Disable LB -> SY block: LB -> SY allowed again.
- [x] Add FR -> CH furniture-only block.
- [x] FR -> CH furniture rejected.
- [x] FR -> CH vehicle allowed.
- [x] FR -> CH motorcycle allowed.
- [x] FR -> CH goods allowed.
- [x] Same-country block works.

# V. Required tenant/request separation tests

- [x] CH customer can create LB -> LB.
- [x] Request customer tenant remains CH.
- [x] Request origin tenant resolves LB.
- [x] Matching finds eligible drivers.
- [x] Customer does not become LB tenant.
- [x] Client cannot forge LB tenant in request body.

# W. Border-driver test

- [x] FR driver remains home tenant FR.
- [x] CH operational coverage approved.
- [x] CH -> CH route approved.
- [x] Driver near Swiss pickup.
- [x] CH request creates candidate.
- [x] Driver receives `requestNew`.
- [x] Driver submits offer.
- [x] Driver cannot browse unrelated CH requests.
- [x] GPS crossing border never changes tenant.

# X. Security

- [ ] Body tenant override denied.
- [ ] Query tenant override denied.
- [x] Wrong-market login denied.
- [ ] Customer ownership enforced.
- [x] Arbitrary driver request access denied.
- [x] Candidate-specific access allowed.
- [x] Candidate does not expose unrelated tenant data.
- [x] Admin route-block permission enforced.
- [x] Socket room spoofing denied.
- [x] Stale notification denied.
- [x] Queue cannot bypass route block.
- [x] Direct offer endpoint cannot bypass route block.

# Y. Performance

- [x] RouteBlock lookup indexed.
- [x] Driver country lookup indexed.
- [x] Driver route lookup indexed.
- [x] Candidate lookup indexed.
- [x] Open request lookup indexed.
- [x] No global driver scan.
- [x] No global request scan.
- [x] Route policy does not enumerate allowed routes.

# Z. Backward compatibility

- [x] Current released auth payloads inspected.
- [x] Temporary market-code fallback planned if required.
- [ ] Old app builds not broken before compatible update.
- [x] Existing event names preserved.
- [ ] Existing request statuses preserved.
- [ ] Current payment behavior preserved.
- [ ] Current tracking behavior preserved.
- [ ] Historical requests remain readable.
- [ ] Existing active jobs remain valid.

# AA. Production rollout

- [ ] DB backup created.
- [ ] Tenant migrations run.
- [ ] Existing users explicitly backfilled.
- [ ] Request geography fields deployed.
- [ ] RouteBlock deployed.
- [ ] Driver coverage/permissions deployed.
- [ ] Backward-compatible API deployed.
- [ ] Admin route-block UI deployed.
- [ ] Client app deployed.
- [ ] Driver app deployed.
- [ ] Tenant enforcement enabled only when compatible apps are live.
- [ ] Start with zero blocks unless business wants specific restrictions.
- [ ] Monitor auth/route-policy/matching errors.

# AB. Final acceptance

- [ ] Empty block table means all routes allowed.
- [ ] Admin can block LB -> SY without deployment.
- [ ] Reverse route remains allowed unless separately blocked.
- [ ] Type-specific blocks work.
- [ ] CH customer can request LB -> LB.
- [ ] FR border driver can receive eligible CH requests.
- [ ] FR driver cannot browse unrelated CH jobs.
- [ ] GPS never changes tenant.
- [ ] Wrong-market login is blocked.
- [ ] Existing same-country flow works.
- [ ] Existing cross-border flow works.
- [ ] API tests pass.
- [ ] Client build/tests pass.
- [ ] Driver build/tests pass.
- [ ] Admin build/tests pass.
