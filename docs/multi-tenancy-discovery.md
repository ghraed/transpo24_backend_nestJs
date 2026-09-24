# Country multi-tenancy discovery — M0

Inspected 2026-09-24, all four repositories on `multi_tenant`, initially clean.
Authoritative source directory:
`/media/raed/Data8/from ubuntu/transpo_24/transpo24-multitenancy-default-allow-docs`.
DECISIONS.md is authoritative; ROADMAP.md defines milestone order; CHECKLIST.md
in that directory is the persistent completion tracker.

## Repositories and installed versions

| Project | Actual Git root | Installed core packages |
| --- | --- | --- |
| API | `backend/api` | NestJS 11.2.1, TypeScript 5.9.3, Prisma client 7.9.1, pg 8.21.0, BullMQ 5.77.0, ioredis 5.10.1, Socket.IO 4.8.3 |
| Customer | `client_mobile/app` | Expo 56.0.20, React Native 0.85.3, React 19.2.3, Expo Router 56.2.19, TypeScript 6.0.3 |
| Driver | `driver_mobile` | Expo 56.0.21, React Native 0.85.3, React 19.2.3, Expo Router 56.2.20, TypeScript 6.0.3 |
| Admin | `admin/Transpo_24` | Next.js 15.5.24, Refine core 5.0.12, React 19.1.2, TypeScript 5.9.3 |

Sibling `backend/src` and `client_mobile/src` are not the requested repositories.
The outer `admin` directory is not the admin application's Git root.
Applicable AGENTS.md files require reading Expo SDK 56 documentation before coding;
https://docs.expo.dev/versions/v56.0.0/ was read. Framework upgrades are out of scope.

## API map

- Database: `prisma/schema.prisma`, PostgreSQL, cuid IDs, snake-case table mappings
  for most models. Prisma 7 uses `prisma.config.ts` and `PrismaPg` in
  `src/prisma/prisma.service.ts`. There were 64 existing migrations; do not edit them.
- Identity: `User` with globally unique email and optional globally unique
  `phoneNumber`; `UserRole` is CUSTOMER / DRIVER / ADMIN. ADMIN is the single
  existing global role. COUNTRY_PARTNER / MASTER_ADMIN in driver TypeScript types
  are not implemented API roles; do not infer tenant-admin permissions from them.
- Auth: `src/auth/auth.controller.ts`, `auth.service.ts`, DTOs and guards.
  Password customer/driver registration and login coexist with Twilio Verify OTP.
  Customer OTP issues rotating hashed `RefreshSession` records; driver app uses
  `driver/session/continue` with its stored signed token (existing expiry bypass
  for this trusted continuation is retained). Driver setup can attach to an
  existing customer identity after password verification; ownership must not change.
- Released access tokens are two-part HMAC-SHA256 signed payloads, not JWTs.
  Customer `src/lib/auth-token.ts:isAccessTokenExpired` decodes segment zero.
  Changing default issuance directly to JWT would break it. M1 adds optional
  JWT issuance and verification of both formats; see rollout guide.
- Current profile geography: `User.countryCode`, `DriverProfile.countryCode`,
  `countryCodes`, `cities`, `coverageAreas`. These are editable profile/coverage
  fields, not reliable sources for production home-tenant backfill.
- Requests: `TransportRequest`, `Service` / `ServiceKey` with
  VEHICLE_TRANSPORT, MOTORCYCLE_TRANSPORT, GOODS_TRANSPORT, FURNITURE_TRANSPORT.
  `TransportRequest.currency` already exists (nullable); reuse it for M2 instead
  of adding a conflicting second currency field.
- Request creation: `src/customer-requests/customer-requests.service.ts`:
  `createDraftRequest`, dedicated motorcycle/goods/furniture creation,
  `updatePickupLocation`, `updateDropoffLocation`, `editCustomerRequest`,
  `submitCustomerRequest`. Audit all these paths in M2/M3; draft geography can
  be incomplete and edits must not bypass current policy.
- Matching: `src/driver/request-eligibility.ts` and
  `vehicle-load-capacity.util.ts` are existing shared eligibility/load helpers.
  Customer service `dispatchSubmittedRequestToEligibleDrivers` runs synchronously.
  Driver service has available-request discovery, alert refresh, offer submission,
  coverage and live-location updates. It currently considers approved drivers,
  online availability, vehicle/document approval, live or base location, radius,
  immediate/scheduled work, weekly schedules, vehicle dimensions/load.
- Existing discovery bridge: `DriverRequestAlert` has a unique request/driver pair
  and NEW / SEEN / ACCEPTED / IGNORED / EXPIRED statuses. Investigate extending
  this as the RequestCandidate equivalent before introducing a duplicate table.
  Current driver discovery still scans open requests and allows dynamic eligibility;
  it is not yet the required request-specific cross-tenant authorization boundary.
- Offers: `DriverOffer`; `DriverService.sendDriverPriceOffer`, alert acceptance,
  customer `acceptDriverOffer` and `finalizeAcceptedOfferPayment`. Offers currently
  carry currency; driver country helpers are used. M2/M9 must reconcile request
  currency without automatic FX or altering existing settled payments.
- Lifecycle/tracking: `src/trips/trips.service.ts`, `trips.controller.ts`,
  `trips.gateway.ts`; `DriverLocation`, request proof photos, extra expenses,
  ratings/earnings, chat and private request files have their own participant checks.
  Review `src/chat` and `src/request-files` as part of M9.
- Sockets: `TripsGateway` verifies signed identity and joins customer/driver rooms;
  events include `requestNew`, `offerNew`, `offerRejected`, `requestDriverSelected`.
  Trip/chat room joins call participant authorization. Driver room construction
  currently uses user ID in one path and profile ID for dispatch; review this
  discrepancy in M8. M1 adds current DB/tenant validation before initial room join.
- Push: `src/notifications/notifications.service.ts`, `src/push-tokens`, Expo
  push/environment isolation and admin web-push provider. Existing dispatch sends
  per-user request pushes. Candidate eligibility and stale deep-link authorization
  still need M7–M9 work.
- BullMQ/Redis: `src/payments/driver-payout-queue.service.ts` creates queue/worker
  and reloads payout jobs by trip ID. Phone rate limits and translations use Redis
  through their existing services. There is no matching queue yet; reuse queue
  conventions, not the payout queue itself, when implementing request matching.
- Payments: `src/payments/payments.service.ts`, `stripe.service.ts`, wallet, holds,
  settlements, capture/refund/dispute/reconciliation and payout queue. Do not infer
  tenant/currency from GPS or rewrite historical settled currencies.
- Country/currency utility: `src/common/currency/country-currency.util.ts`.
  Current normalization only checks length; M2 needs proper alpha-2 validation.
  Backend saved places: `src/customer-requests/customer-places.service.ts`.
  Google Places/Geocoding currently runs in the mobile `src/lib/places.ts` helpers;
  there is no central authoritative backend country resolver yet.
- Admin permissions: `src/admin/guards/admin-role.guard.ts`, authenticated user
  guard, admin controllers/services. Use existing auth; do not add a second system.
- HTTP: `src/config/http.ts` uses whitelist + forbidNonWhitelisted validation.
  `JsonExceptionFilter` already preserves structured error `code` values.

## Mobile and admin map

Customer:
- `src/lib/api.ts` sends OTP/password auth requests without `marketCode` today.
- `src/lib/auth-token.ts` keeps in-memory state and SecureStore access/refresh/user/
  trusted-session records, refreshes on 401 and handles logout.
- `src/requests/vehicle-draft-storage.ts`, draft/submit helpers, address editors,
  `src/lib/places.ts` (Google autocomplete/details/geocode/directions).
- `src/components/phone-auth-screen.tsx`, profile tab and request screens need M10.
  Audit private saved/draft state as well as tokens during account switching.

Driver:
- `src/context/auth-context.tsx`, `src/lib/auth-storage.ts` (SecureStore access,
  trusted session, remembered credentials, onboarding/vehicle/capacity drafts).
- `src/lib/api.ts`, `src/types/auth.ts`, driver phone auth screen.
- `src/location/request-matching-location.ts` / background-trip-tracking and hooks
  control GPS heartbeat/tracking; GPS must remain separate from home tenant.
- Country/currency helpers and driver availability/coverage screens already exist;
  operational-country and directional approval authorization does not yet exist.

Admin:
- `src/app/_refine_context.tsx` defines resources/menu entries.
- `src/providers/data-provider/index.ts` has named Refine REST providers and a
  shared authenticated Axios instance with 401 logout handling.
- Auth providers use existing `/auth/admin/login`, cookies, and API ADMIN role.
- Existing list/create/edit patterns: `src/app/admin-users`; operations/review
  pages use Refine custom queries and shared UI components.
- Add only explicit route-block resources in M5; no allowed-route matrix.
