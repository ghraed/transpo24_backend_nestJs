# Multi-tenancy session handoff — 2026-09-24

## Milestones

- **M0 complete:** all four actual repositories and architecture inspected; see
  [discovery](multi-tenancy-discovery.md).
- **M1 implementation complete for the additive compatibility phase:** Tenant,
  user ownership relation, public markets, password/OTP market validation,
  signed tenant context, staged JWT support, refresh binding, trusted driver
  continuation validation, socket handshake validation, explicit backfill and tests.
- **M2–M14 not implemented.** Production enforcement, mandatory ownership
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

## Exact next task: M2 — Request geography

Read this handoff and the source CHECKLIST/DECISIONS/ROADMAP, then start at M2.
Do not repeat discovery or reimplement Tenant/auth.

1. Inspect all creation/submit/edit/location paths in
   `src/customer-requests/customer-requests.service.ts` and current response DTOs.
2. Add an additive migration for customer tenant, optional origin tenant and ISO
   pickup/destination country codes. Reuse the existing nullable request `currency`
   field; preserve historical/accepted payment currencies.
3. Reuse the Google Places/Geocoding provider from mobile helpers to establish
   authoritative geography on the server. Current backend saved-place storage
   alone is not an authoritative country resolver; handle incomplete drafts and
   old clients explicitly without inferring job geography from account tenant.
4. Derive account tenant from authenticated/DB identity; resolve origin tenant
   from pickup country. Persist request currency using verified current pricing
   behavior, without FX conversion or allowing raw client tenant ownership.
5. Test CH customer -> LB/LB separation and all four transport creation/edit flows.
6. Then M3 central default-allow directional RouteBlock policy, M4 admin API,
   M5 Refine UI, M6 coverage, and subsequent milestones in order.

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
