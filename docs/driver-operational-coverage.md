# Driver operational coverage (M6)

The existing profile country/city settings remain preferences, not approval.
Coverage records are checked alongside platform route blocks. Only APPROVED
records with the required pickup/dropoff flags authorize coverage. Routes are
exact and directional. An approved driver with a reviewed home tenant receives
automatic pickup/dropoff coverage and a domestic route for that tenant country.
Foreign coverage and cross-border routes still require admin approval.

## Endpoints

Driver authentication and an existing driver profile are required:

- `GET /driver/me/operational-coverage` returns `{ countries, routes }`.
- `POST /driver/me/operational-coverage/countries` accepts
  `{ countryCode, canPickup, canDropoff }` (booleans required).
- `POST /driver/me/operational-coverage/routes` accepts
  `{ fromCountryCode, toCountryCode }`.

POST creates PENDING entries for other coverage. Repeating POST returns the existing entry unchanged;
changing flags or decisions on an existing entry requires admin review. Ownership,
status and reviewer fields are rejected in driver payloads. Countries normalize to
uppercase ISO alpha-2; invalid codes and null required values are rejected.

Authenticated global ADMIN endpoints use a DriverProfile ID, not User ID:

- `GET /admin/drivers/:driverId/operational-coverage`.
- `POST /admin/drivers/:driverId/operational-coverage/initialize-home` requires an
  already reviewed Tenant assignment. It creates domestic entries as PENDING
  before driver approval, or APPROVED for an approved driver, preserving admin
  decisions. No body or guessed country.
- `PUT /admin/drivers/:driverId/operational-coverage/countries` accepts the country
  body above plus required `status`.
- `PUT /admin/drivers/:driverId/operational-coverage/routes` accepts the route body
  above plus required `status`.

Statuses: PENDING, APPROVED, REJECTED, SUSPENDED. Admin PUT creates or updates the
exact entry and records authenticated reviewer ID and review time. There is no
hard-delete endpoint. Admin review clears the automatic-grant marker, so
reconciliation cannot reverse an admin decision. GPS/profile country changes do
not grant permissions.

## Rollout and verification

Apply the automatic home-grant migration before deploying the matching change.
It backfills domestic records for existing approved drivers with assigned tenants
without changing admin-reviewed rows. New approvals grant home coverage; driver
coverage reads and matching refreshes reconcile later tenant assignments. A home
market change removes old automatic grants, while matching checks the current
tenant before authorizing one. Foreign countries and routes retain separate review.

Run `npm run test:driver-coverage:integration` with `TENANT_TEST_DATABASE_URL` set
only to a migrated disposable local database whose name ends in `_test`.
The script cleans its own fixtures; it assumes no existing FR tenant fixture.
HTTP guards/validation are covered by `driver-coverage-http.spec.ts` using actual
guards and HTTP validation, with mocked auth and coverage services. The database
script exercises the actual service, approval states, uniqueness, foreign keys,
exact direction, same-country routes and permission preservation.
