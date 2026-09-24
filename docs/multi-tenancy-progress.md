# Multi-tenancy session handoff — 2026-09-24

## Milestones

- **M0 complete:** all four actual repositories and architecture inspected; see
  [discovery](multi-tenancy-discovery.md).
- **M1 implementation complete for the additive compatibility phase:** Tenant,
  user ownership relation, public markets, password/OTP market validation,
  signed tenant context, staged JWT support, refresh binding, trusted driver
  continuation validation, socket handshake validation, explicit backfill and tests.
- **M2 implemented for the additive compatibility phase** (see the M2 checkpoint below). **M3 implemented** (see checkpoint below); **M4 implemented** (checkpoint below); **M5 implemented** (checkpoint below); **M6 implemented** (checkpoint below); **M7 implemented** (checkpoint below); **M8 implemented** (checkpoint below); **M9 implemented** (checkpoint below); **M10 implemented** (checkpoint below); **M11–M14 not implemented.** Production enforcement, mandatory ownership
  constraints and enabling JWT issuance remain rollout tasks. The feature as a
  whole is not complete and must not yet be enabled for multiple live markets.

## What changed

API only (all on `multi_tenant`, uncommitted):

- `prisma/schema.prisma` and new migration
  `prisma/migrations/20260924140000_add_tenant_foundation/migration.sql`.
  No old migrations modified; no production migration/backfill performed.
- `src/tenants`: public controller/module/service, safe response types, HTTP tests.
- `src/auth`: market DTO/context, registration/login/OTP/session handling, token
  validation/issuance, tenant-bearing response types, regression tests.
- `src/trips/trips.gateway.ts`: DB/tenant authentication in Socket.IO middleware
  before connect acknowledgement, with handshake spoofing/race tests.
- `src/config/environment.ts`: validated compatibility/enforcement settings.
- `scripts/tenant-backfill.cjs`, `seed-development-tenants.cjs`,
  `test-tenant-foundation.cjs`, `prisma/fixtures/tenants.development.json`, npm scripts.
- Existing API test fixtures repaired for required nickname/applicationId fields
  and request `createdAt`. Production driver/payment/request behavior was not changed.
- Architecture, rollout and this handoff under `docs/multi-tenancy-*.md`.
- Source `CHECKLIST.md` updated only for implemented/verified foundation items.

New endpoint: `GET /tenants/public`.
Changed contracts: optional `marketCode` on customer/driver registration,
password login, phone send/verify and trusted driver continuation. Auth responses
add safe home-tenant metadata. Refresh body stays the same and validates stored
ownership. See [rollout guide](multi-tenancy-rollout.md) for exact endpoints,
errors and settings.

Customer app, driver app and admin: inspected and baseline-tested; **no code
changes** in these repositories. Market selection, route-block UI and all
candidate/lifecycle work remain unchecked.

## Validation

- Full API migration history: all **65** migrations applied to disposable
  PostgreSQL 16 (64 existing plus new M1 migration).
- Upgrade test: pre-change schema with an existing user and refresh session;
  new migration preserved both rows, profile country, credential/session hashes,
  and left tenant ownership unassigned.
- PostgreSQL integration: **10/10 passed**, including dry-run/idempotence/rollback,
  actual password/phone auth, wrong-market rejection, no account transfer,
  refresh rotation, profile-country separation, uniqueness/FK constraints.
- API Jest suite with coverage thresholds: **435/435 tests, 42/42 suites passed**.
- Existing API e2e HTTP suite: **14/14 passed**.
- API build and Prisma schema validation: **passed**.
- ESLint on all changed TypeScript files: **passed**.
- Full API lint: **26 pre-existing errors** in unchanged
  `src/chat/chat.service.ts`, `src/chat/chat.service.spec.ts`,
  `src/driver/driver.service.ts` (formatting and nickname control-character regex).
  Full `test:ci` therefore is not claimed green.
- Development seed CLI passed; production use was rejected by its environment guard.
- Customer: typecheck + privacy source check **passed**. Full Jest baseline stalled
  with CPU active after `address-editor.test.js` passed; terminated after more
  than three minutes. No complete client test result or native build claimed.
- Driver: typecheck + privacy source check **passed**. Jest baseline: **26 suites
  passed, 2 failed; 139 tests passed, 1 failed**. Existing failures:
  `city-coverage-editor.test.js` supplies undefined input to `query.trim()`;
  `scripts/fingerprint-config.test.js` uses node:test and is also collected by Jest,
  which reports no Jest tests (its two node:test checks pass).
- Admin: typecheck, **12/12 web-push tests**, production Next.js build **passed**.
- No mobile native builds/device QA, Stripe live calls, production deployments,
  commits or pushes were performed.

## M2 checkpoint — Request geography (2026-09-24)

Implemented in the API without repeating M0/M1 or modifying mobile/admin code:

- Additive migration `20260924150000_add_request_geography`: nullable
  `customerTenantId`, `originTenantId`, `pickupCountryCode`,
  `destinationCountryCode`, tenant foreign keys and lookup indexes. Reuses the
  existing `currency`; does not alter historical request data or guess backfills.
- `RequestGeographyService` derives ownership from the authenticated customer's
  database identity and reverse-geocodes the actual pickup/destination coordinates
  through the existing Google provider. Address strings, place IDs and raw client
  tenant/country fields do not determine routing geography. ISO alpha-2 validation
  rejects unknown/ambiguous countries; origin tenant can be absent or inactive.
- Vehicle drafts, motorcycle/goods/furniture creation, draft location updates,
  submitted request edits and submission persist authoritative geography. Customer
  request responses expose all four fields and the existing `currency` field.
- New geography uses the existing country-to-currency utility for pickup currency,
  independent from home tenant. Submission/edit preserve an existing currency;
  historical/accepted requests are unchanged. No FX conversion.
- Incomplete drafts retain null geography. With no Google server key and
  `REQUEST_GEOGRAPHY_REQUIRED=false` (default), legacy requests remain usable and
  unresolved geography/currency stays null. With a configured provider, failures
  reject the write; they never silently guess a country. Enforced mode requires a
  server key. See the rollout guide before enabling this.
- Submission and location updates compare database version/status after geocoding,
  preventing stale geography or writes to a concurrently submitted request.
- New reproducible integration command: `npm run test:geography:integration`, with
  `TENANT_TEST_DATABASE_URL` pointing to a disposable migrated local `_test` DB.

Validation: 467 API tests / 43 suites with coverage thresholds, 14 HTTP e2e tests,
7 geography PostgreSQL tests, 10 tenant PostgreSQL regression tests, API build,
full TypeScript check, schema validation and changed-file lint. All 66 migrations
applied to disposable PostgreSQL 16; a pre-M2 completed request retained its CHF
currency, price/status and null new fields. Google responses were mocked; no live
Google/provider validation, production deployment or backfill was performed.
Previous unrelated full-lint/mobile baseline limitations above still apply.

## M3 implementation scope (completed below)

1. Read the source roadmap/decisions/checklist and this handoff. Keep M0–M2 intact.
2. Add directional `RouteBlock` using existing `ServiceKey` conventions, nullable
   type for all types, active flag, reason, creator/audit metadata and indexes.
   Prevent equivalent duplicate active blocks, including null all-type rules.
3. Centralize policy: no applicable active block means allowed. Test all-type,
   type-specific, reverse direction, same-country and deactivated rules.
4. Integrate authoritative checks on request submission and submitted edits,
   including the dedicated transport creation flows as appropriate. Resolve
   geography first and do not allow unresolved compatibility geography to bypass
   enforcement. M2's permissive rollout mode is not a safe route-policy boundary.
5. Preserve accepted/in-progress jobs and generic public errors. M4 adds the admin
   management/check endpoints; M5 adds the UI, then follow milestone order.

Currency follow-up: driver offer creation still derives currency from the driver
profile. M9 must enforce persisted request currency and reject mismatches before
cross-market rollout; M10/M11 must display it. M2 is storage/geography only and does
not make cross-tenant matching/payment authorization complete. The request's
existing `currency` is the canonical field; do not add a parallel `currencyCode`.

Later checks already identified: possible driver user-ID/profile-ID socket-room
mismatch; existing DriverRequestAlert as candidate bridge; no matching queue yet;
customer JWT expiry decoder must support both formats before switching issuance;
only global ADMIN exists in the real API; mobile baseline test issues above.

## Manual deployment work (not performed)

Follow [rollout guide](multi-tenancy-rollout.md): backup, additive migration before
API, reviewed explicit tenant configuration/user mapping (dry-run then apply),
monitor unassigned registrations, compatible apps before enforcement/JWT switch,
final ownership constraints in M13. Keep `TENANT_AUTH_REQUIRED=false` and
`ACCESS_TOKEN_FORMAT=legacy` until the required compatibility and authorization
work is complete. A legacy registration market, if used, must be explicitly chosen
by the deployment owner; the code does not guess one.

## M3 checkpoint — RouteBlock default-allow policy (2026-09-24)

- Added `RouteBlock` with directional ISO country fields, optional existing
  `ServiceKey` (null means all types), internal reason, active flag, creator User
  relation and timestamps. New additive migration `20260924160000_add_route_blocks`.
- Indexed direction/active lookup; two PostgreSQL partial unique indexes reject
  equivalent active rules, including all-type/null rules and concurrent creates.
  Inactive history and simultaneous all-type/type-specific rules are supported.
- Exported `RoutePolicyModule` / `RoutePolicyService.isBlocked/assertAllowed`.
  One current DB lookup; no cache, allowlist, normal-route rows or tenant coupling.
  Invalid/unresolved countries fail closed; public `ROUTE_BLOCKED` omits reasons.
- All four dedicated creation paths are drafts, without matching/notification.
  They retain existing incomplete-draft behavior. Submission re-resolves countries
  and checks the DB service type before any publish/write/dispatch. Open request
  edits check the resulting route inside the existing transaction before changes.
  Existing ownership/status/version checks and persisted currency are preserved.
- Accepted/in-progress lifecycle code is unchanged. Later matching/offer policy
  rechecks remain M7–M9; M3 alone is not complete live route enforcement.
- **Deployment prerequisite:** publication/open edits now reject null geography
  even with `REQUEST_GEOGRAPHY_REQUIRED=false`, including an empty block table.
  Configure and verify the Google server geocoder before deploying this API.
  Draft saving and historical reads remain compatible; no country is guessed.
- Validation: **481 tests / 44 suites with coverage thresholds**, **14 HTTP tests**,
  **21 PostgreSQL tests** (3 policy, 8 geography, 10 tenant), build, TypeScript,
  schema validation and changed-file ESLint passed. All **67 migrations** applied
  to isolated PostgreSQL 16. Provider responses mocked; no live provider/device QA.
  Existing unrelated full-lint/mobile limitations still apply. No deployment,
  production backfill, commit or push.

## M4 implementation scope (completed below)

Reuse existing ADMIN authentication/permissions. Add list/create/update/activate/
deactivate and effective route check endpoints; validate ISO countries and existing
ServiceKey, handle active-duplicate database errors (including reactivation), and
record actor/direction/type/reason/old-new state through existing audit patterns.
Use the shared policy service; no cache invalidation is necessary currently.
Do not expose internal reasons to mobile or cancel accepted jobs. M5 adds the UI.

## M4 checkpoint — Admin route-block API (2026-09-24)

Implemented existing ADMIN-guarded endpoints:

- `GET /admin/route-blocks`: `{ items, total, page, limit }`; optional
  `fromCountryCode`, `toCountryCode`, `transportType`, `isActive` filters.
- `GET /admin/route-blocks/:id`: block detail for editing.
- `POST /admin/route-blocks`: normalized ISO countries, optional existing ServiceKey
  (null = all types), nullable reason up to 1000 characters, optional active boolean.
- `PATCH /admin/route-blocks/:id`: partial edits including activation/deactivation.
- `DELETE /admin/route-blocks/:id`: audited soft deactivation; no destructive delete.
- `GET /admin/route-policy/check?from=LB&to=SY&type=VEHICLE_TRANSPORT`:
  normalized direction/type, `allowed`, and admin-only `blockedBy` ID/reason.

Active duplicates return 409 `ROUTE_BLOCK_DUPLICATE`, including concurrent creates
and reactivation. Missing records return 404. Unknown fields/forged creator are
rejected. Authenticated ADMIN identity is the audit actor. The central policy
lookup deterministically reports an all-types rule before a type-specific rule;
public blocked-route errors still omit internal reasons.

No shared audit facility existed. New additive migration
`20260924170000_add_route_block_audits` persists actor/time/old-new snapshots in the
same transaction as each mutation. Updates lock the row before reading the old
state. Audit insert failure rolls back the mutation. Actor IDs are retained as
historical identifiers independently of account deletion. No allowed-route rows,
cache, request cancellation, or matching changes were introduced.

Validation: 499 Jest tests / 45 suites with coverage thresholds, 14 HTTP e2e tests,
27 PostgreSQL integration tests (6 admin + 3 policy + 8 geography + 10 tenant),
build, TypeScript, Prisma validation, changed-file lint and diff whitespace check.
All 68 migrations applied to isolated PostgreSQL 16. Reproducible new command:
`TENANT_TEST_DATABASE_URL=... npm run test:route-block-admin:integration` (local
empty disposable `_test` database only). Existing unrelated lint/mobile baseline
limitations still apply. No production migration, deployment, commit or push.

## M5 implementation scope (completed below)

Reuse existing admin resources/provider/auth. Add Route Blocks menu, paginated
list and filters, create/edit forms, active toggle, clear FROM -> TO and all-type
labels, reason/timestamps/creator, duplicate warnings, and explicit block
confirmation. Warn that accepted/in-progress transports are not auto-cancelled.
Use M4 endpoints above. Keep existing completed API work and follow M6 afterward.

Checklist progress: 125/316 checked (39.6%); 191 remain. Milestones M0–M4: 5/15
(33.3%), unweighted. Full feature and production rollout remain incomplete.

## M5 checkpoint — Admin route-block UI (2026-09-24)

Implemented in `admin/Transpo_24`, preserving completed API/mobile code:

- Refine resource, sidebar/home navigation, authenticated ADMIN list/create/edit.
- Existing custom provider/Axios auth; M4 server pagination and four exact filters.
- ISO country selectors, explicit direction/type, status, reason, timestamps,
  creator ID, reviewed create/edit/activation/deactivation and duplicate conflict UX.
- Reverse direction unchanged; accepted/in-progress jobs not auto-cancelled.
  UI explicitly warns that matching/offer enforcement remains pending M7–M9.
- Regression verification: 97 existing API tests / 5 suites passed. Admin typecheck,
  changed-file lint, production build, 12 web-push tests and 7 mocked-API browser
  scenario groups passed (including mobile-width layout and no runtime errors).
- Browser test and reproducible commands: `admin/Transpo_24/docs/route-blocks.md`.
  No live backend/browser integration, production changes, commit or push.

Current checklist: **145/316 (45.9%)**, unweighted. M0–M5 implemented for
their stated scope; production rollout and full feature acceptance remain pending.

## M6 implementation scope (completed below)

Read roadmap/decisions/current checklist and preserve M0–M5. Inspect existing
DriverProfile, operational areas/country data and admin driver approval conventions.
Implement operational-country coverage with pickup/dropoff permissions, explicit
approval statuses and driver/country uniqueness, plus directional route permissions
with driver/from/to uniqueness. Home-country initialization must be explicit and
compatible with reviewed tenant backfills; foreign coverage is never auto-approved
and GPS never grants permissions. Add additive migrations and meaningful API/DB
regressions. Follow with centralized eligibility/candidates in M7; driver mobile
management UI remains M11. Do not enable cross-market production rollout yet.


## M6 checkpoint — Driver operational coverage (2026-09-24)

- Added `DriverOperationalCountry` and directional `DriverRoutePermission`, using
  DriverProfile IDs, unique compound keys, lookup indexes and PENDING / APPROVED /
  REJECTED / SUSPENDED states. Country coverage separates pickup and dropoff.
  Additive migration: `20260924180000_add_driver_operational_coverage`.
- Driver-owned endpoints list coverage and request countries/routes as PENDING.
  Existing entries are returned unchanged: repeated requests cannot self-approve,
  expand approved flags, or reset rejection/suspension. ADMIN endpoints review
  permissions and retain reviewer identity/time. Auth/profile IDs come from server
  identity; DTOs reject forged ownership, review and status fields.
- Explicit ADMIN home initialization derives country only from assigned Tenant,
  creates pending home-country and domestic-route rows atomically, and preserves
  existing decisions. No production assignments, bulk approval, inferred profile
  country, or GPS-based permission grants. Reviewed tenant backfill must happen first.
- Shared `assertApproved` checks approved pickup/dropoff and exact directional route
  with stable country/route error codes. M7 must compose it into eligibility; this
  milestone does not change existing matching, offers, sockets or active jobs.
- Verification: **515 tests / 46 suites with coverage**, **14 HTTP e2e tests**,
  **30 PostgreSQL tests** (3 M6 scenario groups + 27 existing regressions), build,
  TypeScript, schema validation and changed-file lint passed. All **69 migrations**
  applied to isolated PostgreSQL 16. M0–M5 implementation preserved.
- API contract and reproduction: [driver coverage](driver-operational-coverage.md).
  No production migration/backfill, deployment, mobile changes, commit or push.

## M7 checkpoint — Matching and persisted candidates (2026-09-24)

- Extended `DriverRequestAlert` as the RequestCandidate equivalent with independent
  `isActive`/`matchedAt`, existing unique/FK relationships, indexed candidate access
  and open-route lookup. Additive migration; no existing migration rewritten.
- Central matching requires approved pickup/dropoff countries and exact direction,
  current default-allow route policy, active approved profile, online availability,
  compatible approved/documented vehicle, capacity, radius, schedule and existing
  offer/dismissal rules. Home-tenant equality is never required.
- Driver discovery is candidate-backed and request-specific, with batched current
  policy/approval checks. Driver refresh pages approved directions in groups of 100.
  Selected-driver details keep the existing active-job path.
- Opt-in ID-only BullMQ matching reloads current database state, locks the request,
  and upserts candidates idempotently; default synchronous dispatch and enqueue
  failure fallback remain available. Socket/push delivery audit is still M8.
- Validation: **519 API tests / 47 suites with coverage**, **14 HTTP tests**,
  **38 integration scenarios** (30 foundation database regressions + 8 matching
  scenarios, including real isolated Redis delivery), build, full TypeScript and
  schema validation passed. All **70 migrations** applied to isolated PostgreSQL 16.
- Changed/new code is lint-clean except pre-existing driver nickname/formatting
  errors retained unchanged. Full repository lint is not claimed green.
- Reviewed operational approvals and migration are required before deployment;
  legacy alerts default inactive. No production mutation, mobile/admin changes,
  commit or push. See [matching contract and tests](request-matching.md).

## M8 checkpoint — Socket/push targeting (2026-09-24)

Fixed server-resolved driver profile rooms and added current candidate/policy
checks for request socket and push delivery. Preserved participant event contracts,
reconnect authorization and API-authorized notification detail loading. Recipient
failures are isolated; best-effort delivery and candidate-list recovery are explicit,
without a durable outbox or guaranteed push retry.

Validation: 527 API tests (526 coverage + one focused addition), 14 HTTP tests,
39 isolated PostgreSQL/Redis scenarios, build, TypeScript and gateway/matching/
notification lint. All 70 migrations applied only to disposable PostgreSQL.
No production changes or mobile builds. Contract: [request notifications](request-notifications.md).

Checklist: **223/316 complete (70.6%); 93 remain (29.4%)**.

## M9 checkpoint — Offer/lifecycle authorization (2026-09-24)

Direct offers now recheck active candidates, current matching eligibility and route
policy inside the request transaction, and enforce persisted request currency.
Existing price/ETA/version/alert/duplicate checks and event contracts are preserved.
A database-backed FR-driver/CH-job regression verifies the selected-driver lifecycle
continues after a route block, including wallet selection, photos, chat, tracking,
expenses, delivery, rating, payout scheduling and due-balance release. No external
Stripe transfer or mobile device behavior is claimed.

Validation: **527 unit tests / 47 suites with coverage**, **14 HTTP tests**,
**7 new + 38 prior PostgreSQL scenarios**; one prior Redis scenario skipped.
Build, TypeScript and schema validation passed. Existing driver-service lint errors
remain; other changed TypeScript files pass. All 70 migrations applied only to
isolated PostgreSQL 16. No production changes, schema change, backfill or commit.
See [offer/lifecycle contract and verification](offer-lifecycle.md).

Checklist: **250/316 complete (79.1%); 66 remain (20.9%)**, unweighted.

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

## Exact next task: continue M11 — Driver mobile

Preserve implemented market, coverage, currency, discovery and detail screens.
Cross-tenant detail opening and offer navigation are verified. Continue broader
stale-job handling, complete offer-flow verification, and selected-driver lifecycle
UI acceptance. M12–M14 and final acceptance remain open.
