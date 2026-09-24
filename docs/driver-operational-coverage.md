# Driver operational coverage (M6)

The existing profile country/city settings remain preferences, not approval.
These new records are independent of home tenant and platform route blocks.
Only APPROVED records with the required pickup/dropoff flags authorize coverage.
Routes are exact and directional; domestic routes also need explicit approval.
M7 will integrate this predicate into matching; M9 will enforce offer authorization.

## Endpoints

Driver authentication and an existing driver profile are required:

- `GET /driver/me/operational-coverage` returns `{ countries, routes }`.
- `POST /driver/me/operational-coverage/countries` accepts
  `{ countryCode, canPickup, canDropoff }` (booleans required).
- `POST /driver/me/operational-coverage/routes` accepts
  `{ fromCountryCode, toCountryCode }`.

POST creates PENDING entries. Repeating POST returns the existing entry unchanged;
changing flags or decisions on an existing entry requires admin review. Ownership,
status and reviewer fields are rejected in driver payloads. Countries normalize to
uppercase ISO alpha-2; invalid codes and null required values are rejected.

Authenticated global ADMIN endpoints use a DriverProfile ID, not User ID:

- `GET /admin/drivers/:driverId/operational-coverage`.
- `POST /admin/drivers/:driverId/operational-coverage/initialize-home` requires an
  already reviewed Tenant assignment. Atomically creates PENDING country/domestic
  route entries, preserving any existing decision. No body or guessed country.
- `PUT /admin/drivers/:driverId/operational-coverage/countries` accepts the country
  body above plus required `status`.
- `PUT /admin/drivers/:driverId/operational-coverage/routes` accepts the route body
  above plus required `status`.

Statuses: PENDING, APPROVED, REJECTED, SUSPENDED. Admin PUT creates or updates the
exact entry and records authenticated reviewer ID and review time. There is no
hard-delete endpoint. Driver/GPS/profile updates do not modify these records.
Home initialization does not approve an existing or new driver automatically.

## Rollout and verification

Apply the additive migration before deploying this module. It creates empty tables
and leaves existing users, profiles and jobs unchanged. Explicitly backfill reviewed
tenant ownership first, initialize each driver's home records, then review country
and route approvals. Foreign countries/routes require separate review. Mobile
management screens remain M11; do not enable cross-market production yet.

Run `npm run test:driver-coverage:integration` with `TENANT_TEST_DATABASE_URL` set
only to a migrated disposable local database whose name ends in `_test`.
The script cleans its own fixtures; it assumes no existing FR tenant fixture.
HTTP guards/validation are covered by `driver-coverage-http.spec.ts` using actual
guards and HTTP validation, with mocked auth and coverage services. The database
script exercises the actual service, approval states, uniqueness, foreign keys,
exact direction, same-country routes and permission preservation.
