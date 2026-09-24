# Multi-tenancy session handoff — 2026-09-24

## Milestones

- **M0 complete:** all four actual repositories and architecture inspected; see
  [discovery](multi-tenancy-discovery.md).
- **M1 implementation complete for the additive compatibility phase:** Tenant,
  user ownership relation, public markets, password/OTP market validation,
  signed tenant context, staged JWT support, refresh binding, trusted driver
  continuation validation, socket handshake validation, explicit backfill and tests.
- **M2 implemented for the additive compatibility phase** (see the M2 checkpoint below). **M3–M14 not implemented.** Production enforcement, mandatory ownership
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

## Exact next task: M3 — RouteBlock default-allow policy

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
