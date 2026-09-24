# CHECKLIST.md — Transpo24 Multi-Tenancy + Default-Allow Route Blocks

Snapshot of the authoritative checklist in `../../../transpo24-multitenancy-default-allow-docs/CHECKLIST.md`, which is outside Git. Captured after M2 on 2026-09-24.

Use this checklist across API, client mobile, driver mobile and admin.

## Session checkpoint — 2026-09-24

M0 discovery, M1 tenant foundation and M2 request geography are implemented and
verified for the **additive compatibility phase**. The full multi-tenancy feature is not complete.
M3–M14 remain pending; **next task: M3 — RouteBlock default-allow policy**.

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

- [ ] Add `RouteBlock`.
- [ ] Add from country.
- [ ] Add to country.
- [ ] Add optional transport type.
- [ ] Add reason.
- [ ] Add active flag.
- [ ] Add creator if compatible.
- [ ] Add timestamps.
- [ ] Add indexes.
- [ ] Add migration.
- [ ] Equivalent duplicate active rule prevented/warned.
- [ ] Null transport type means all.
- [ ] Directionality preserved.
- [ ] Same-country block supported.

# F. Route policy service

- [ ] Central `isBlocked()` exists.
- [ ] All-type block checked.
- [ ] Type-specific block checked.
- [ ] Any matching active block returns blocked.
- [ ] No matching block returns allowed.
- [ ] No allowlist fallback exists.
- [ ] No DB row required for allowed routes.
- [ ] Cache invalidation works if cache is used.
- [ ] Unit tests cover precedence.

# G. Request creation

- [x] Customer tenant derived from auth.
- [x] Pickup country resolved.
- [x] Destination country resolved.
- [ ] Route block checked.
- [ ] `ROUTE_BLOCKED` returned when blocked.
- [ ] No block means request allowed.
- [x] Origin tenant resolved.
- [x] Currency persisted.
- [x] Request persisted.
- [ ] Matching queued.
- [x] Same-country request works.
- [x] Cross-border request works.
- [x] Customer may create request outside home tenant.
- [x] CH customer can create LB -> LB.

# H. Driver coverage

- [ ] Operational-country model added/reused.
- [ ] Pickup permission exists.
- [ ] Dropoff permission exists.
- [ ] Approval status exists.
- [ ] Driver/country uniqueness exists.
- [ ] Home-country coverage initialized appropriately.
- [ ] Foreign coverage is not auto-approved.
- [ ] GPS does not grant permission.

# I. Driver route permissions

- [ ] Directional route permission exists.
- [ ] Approval status exists.
- [ ] Unique driver/from/to exists.
- [ ] FR -> CH differs from CH -> FR.
- [ ] Pending/rejected/suspended do not authorize.

# J. RequestCandidate

- [ ] Candidate model added/reused.
- [ ] Request relation exists.
- [ ] Driver relation exists.
- [ ] Active state exists.
- [ ] Unique request/driver exists.
- [ ] Indexes exist.
- [ ] Upsert is idempotent.
- [ ] Access is request-specific only.

# K. Matching

- [ ] Central eligibility service exists.
- [ ] Driver active check.
- [ ] Driver approval check.
- [ ] Online check if applicable.
- [ ] Request state check.
- [ ] Current route-block check.
- [ ] Operational-country check.
- [ ] Directional driver-route check.
- [ ] Vehicle/type check.
- [ ] Capacity check.
- [ ] Document checks.
- [ ] Location/radius check.
- [ ] Schedule check if applicable.
- [ ] Existing-offer checks.
- [ ] Driver tenant equality is NOT mandatory.
- [ ] Cross-tenant candidate works.
- [ ] Matching avoids global scans/N+1.

# L. Blocking existing open work

- [ ] New request rejected immediately after block activation.
- [ ] Open unassigned requests get no new candidates.
- [ ] New offers denied after route becomes blocked.
- [ ] Accepted/in-progress jobs continue.
- [ ] Admin UI warns about this.
- [ ] Queue worker rechecks current route block.
- [ ] Stale queue job cannot bypass block.

# M. Socket.IO

- [ ] Authenticated user rooms.
- [ ] Authenticated driver rooms.
- [ ] `requestNew` only to candidates.
- [ ] Cross-tenant candidate receives event.
- [ ] Ineligible driver receives nothing.
- [ ] `offerNew` targets customer.
- [ ] `offerRejected` targets participant.
- [ ] `requestDriverSelected` targets participant.
- [ ] Arbitrary room join denied.
- [ ] Reconnect restores only authorized subscriptions.

# N. Push notifications

- [ ] Candidate-specific request push.
- [ ] No tenant-wide broadcast as authorization.
- [ ] Deep link reloads through API.
- [ ] Stale push cannot bypass current authorization.
- [ ] Blocked route creates no new request push.

# O. Offers

- [ ] Candidate/current eligibility checked.
- [ ] Route policy rechecked.
- [ ] Non-candidate denied.
- [ ] Cross-tenant candidate allowed.
- [ ] Request currency enforced.
- [ ] Price/ETA validation preserved.
- [ ] Customer event/notification preserved.

# P. Full job lifecycle

For selected cross-tenant driver:

- [ ] Accept.
- [ ] En route pickup.
- [ ] Arrived.
- [ ] Pickup complete.
- [ ] Pickup photos.
- [ ] En route delivery.
- [ ] Delivered.
- [ ] Delivery photos.
- [ ] Extra expenses.
- [ ] Chat.
- [ ] Tracking.
- [ ] Approach alert.
- [ ] Payment release.
- [ ] Rating.
- [ ] No step fails only because tenants differ.

# Q. Client mobile — React Native + Expo

- [ ] Fetch markets.
- [ ] Market selection screen.
- [ ] Persist selected market.
- [ ] Send market on registration/login.
- [ ] Handle `TENANT_MISMATCH`.
- [ ] Show home market read-only.
- [ ] Cross-border pickup/destination works.
- [ ] Request outside home tenant works.
- [ ] Handle `ROUTE_BLOCKED`.
- [ ] Show generic unavailable message.
- [ ] Display API currency.
- [ ] No hard-coded currency symbol.
- [ ] Logout clears private caches.
- [ ] Account switching cannot leak prior data.

# R. Driver mobile — React Native + Expo

- [ ] Fetch markets.
- [ ] Market selection/auth.
- [ ] Handle `TENANT_MISMATCH`.
- [ ] Home market read-only.
- [ ] Operational-country screen.
- [ ] Directional route-permission screen.
- [ ] Approval statuses displayed.
- [ ] Candidate-backed available requests.
- [ ] Pickup/destination countries displayed.
- [ ] Cross-border route displayed.
- [ ] Request currency displayed.
- [ ] Cross-tenant request opens normally.
- [ ] Removed/blocked request handled gracefully.
- [ ] Offer flow works.
- [ ] Active-job lifecycle still works.

# S. Admin — Next.js + Refine

- [x] Existing admin resource pattern inspected.
- [ ] `Route Blocks` menu/resource added.
- [ ] List page added.
- [ ] Create form added.
- [ ] Edit form added.
- [ ] Activate/deactivate control added.
- [ ] Origin filter.
- [ ] Destination filter.
- [ ] Transport-type filter.
- [ ] Active/inactive filter.
- [ ] Direction shown clearly.
- [ ] All-types vs specific type shown.
- [ ] Reason shown.
- [ ] Timestamps shown.
- [ ] Creator shown if available.
- [ ] Duplicate active rule warned/prevented.
- [ ] Confirmation explicitly states FROM -> TO.
- [ ] Reverse route warning shown where useful.
- [ ] Existing in-progress jobs warning shown.
- [ ] Admin permission enforced.

# T. Admin API

- [ ] List route blocks.
- [ ] Create route block.
- [ ] Update route block.
- [ ] Activate/deactivate.
- [ ] Delete/soft-delete following convention.
- [ ] Effective route-status check endpoint/service.
- [ ] Country validation.
- [ ] Transport-type validation.
- [ ] Reason validation.
- [ ] Actor auditing.
- [ ] Permission tests.
- [ ] Directionality tests.
- [ ] All-types precedence tests.

# U. Required route-policy tests

- [ ] Empty RouteBlock table: FR -> CH allowed.
- [ ] Empty table: CH -> LB allowed.
- [ ] Empty table: LB -> LB allowed.
- [ ] Add LB -> SY all-types block: LB -> SY rejected.
- [ ] SY -> LB remains allowed.
- [ ] LB -> FR remains allowed.
- [ ] Disable LB -> SY block: LB -> SY allowed again.
- [ ] Add FR -> CH furniture-only block.
- [ ] FR -> CH furniture rejected.
- [ ] FR -> CH vehicle allowed.
- [ ] FR -> CH motorcycle allowed.
- [ ] FR -> CH goods allowed.
- [ ] Same-country block works.

# V. Required tenant/request separation tests

- [x] CH customer can create LB -> LB.
- [x] Request customer tenant remains CH.
- [x] Request origin tenant resolves LB.
- [ ] Matching finds eligible drivers.
- [x] Customer does not become LB tenant.
- [x] Client cannot forge LB tenant in request body.

# W. Border-driver test

- [ ] FR driver remains home tenant FR.
- [ ] CH operational coverage approved.
- [ ] CH -> CH route approved.
- [ ] Driver near Swiss pickup.
- [ ] CH request creates candidate.
- [ ] Driver receives `requestNew`.
- [ ] Driver submits offer.
- [ ] Driver cannot browse unrelated CH requests.
- [ ] GPS crossing border never changes tenant.

# X. Security

- [ ] Body tenant override denied.
- [ ] Query tenant override denied.
- [x] Wrong-market login denied.
- [ ] Customer ownership enforced.
- [ ] Arbitrary driver request access denied.
- [ ] Candidate-specific access allowed.
- [ ] Candidate does not expose unrelated tenant data.
- [ ] Admin route-block permission enforced.
- [ ] Socket room spoofing denied.
- [ ] Stale notification denied.
- [ ] Queue cannot bypass route block.
- [ ] Direct offer endpoint cannot bypass route block.

# Y. Performance

- [ ] RouteBlock lookup indexed.
- [ ] Driver country lookup indexed.
- [ ] Driver route lookup indexed.
- [ ] Candidate lookup indexed.
- [ ] Open request lookup indexed.
- [ ] No global driver scan.
- [ ] No global request scan.
- [ ] Route policy does not enumerate allowed routes.

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
