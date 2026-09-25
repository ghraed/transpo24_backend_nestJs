# M13 compatibility verification — 2026-09-25

M13 is complete for the owner-approved **local client/driver apps and Stripe test-mode**
verification scope. Store-distributed binaries, production deployment and final
release acceptance remain M14/AB gates. Application business logic was not changed.

## Auth and local apps

- Real Nest HTTP validation/controller/service + isolated PostgreSQL tests use
  existing customer and driver login/OTP payloads with no `marketCode`.
- Legacy two-part tokens retain expiry in segment zero. After explicit reviewed
  fixture backfill, old tokens hydrate the account tenant, customer refresh rotates
  successfully, and trusted driver continuation retains the assigned home tenant.
  Explicit wrong-market login remains forbidden. Twilio verification is stubbed;
  no SMS is sent.
- 12 tenant integration tests passed, including the two new HTTP/backfill cases.
- Local client: 37 tests across auth/token restoration, market/API contracts,
  market selection, saved-card selection and Stripe return handling passed.
- Local driver: 40 tests across market auth, selection and payout screens passed.
- Both apps passed TypeScript and privacy checks. Native app modules/network are
  mocked in these screen tests; this is not a new device or store-binary run.
- 68 existing API auth/market/payment/Stripe/card regressions passed.

## Card collection and driver transfer

`M13_STRIPE_TEST=1` adds an opt-in real Stripe test-mode path to the existing isolated
lifecycle runner. It refuses live keys; the database guard requires an explicitly
provided local `_test` database. Default runs still forbid Stripe calls.

- A synthetic test customer, Stripe `tok_visa` card (last four 4242) and verified
  test Connect recipient are created. No personal or real payment details are used.
- Both a tenant-aware request and an accepted legacy request with null tenant/
  geography fields and no candidate record complete the existing lifecycle.
- Each test collects USD 100 by card, preserves the request currency, approves the
  existing USD 10 cash expense, produces USD 95 driver earnings / USD 15 platform
  fee, and transfers USD 95 through the application's real `StripeService`.
- Stripe confirms the destination, amount, currency, source charge and trip group.
  Repeating payout returns the same transfer; exactly one transfer exists per trip.
  Both earning and settlement persist `PAID_OUT`.
- Cleanup reverses test transfers, refunds test card collections and deletes only
  the created test customer/account. PostgreSQL fixture rows are removed too.
- Nine Stripe-mode lifecycle tests passed. The default CHF wallet-backed lifecycle
  and historical-read regressions remain in place. This verifies Connect transfers,
  not external bank payouts or the Express onboarding UI (recipient fixture is Custom).
- Notifications, socket delivery and queue dispatch remain stubs. No production
  payment, production database write, native card entry or webhook delivery is claimed.

### Settlement-currency prerequisite discovered

A real test with a CHF charge and CHF transfer failed because the configured US
Stripe platform settles the source charge in USD. Stripe requires the source
charge's balance-transaction currency to match the transfer currency. The payment
code before multi-tenancy (`a427c95^`) already used the same request-currency and
source-charge transfer fields: this is an existing settlement limitation, not a
new tenant regression. The successful test uses USD, matching this platform.

Before activating a non-USD production market, verify its complete charge/transfer
settlement configuration. CHF payout success is **not** established by M13.
Do not convert amounts silently, remove source-charge linkage to bypass the
failure, or introduce automatic FX; D035/D036 keep currency explicit and FX deferred.
This remains a production market-activation gate, separate from preserving existing
USD payment behavior. Stripe testing reference: https://docs.stripe.com/connect/testing

## Reproduce

Use a migrated disposable local PostgreSQL database ending in `_test`. Never supply
production data. `TENANT_TEST_DATABASE_URL` is required and has no application-URL
fallback. The completed run used `transpo24_m13_20260925_test` (all 70 migrations).

```sh
TENANT_TEST_DATABASE_URL='postgresql://.../local_test' npm run test:tenants:integration
TENANT_TEST_DATABASE_URL='postgresql://.../local_test' npm run test:offer-lifecycle:integration
# Explicit opt-in: loads the test key from .env; creates/refunds synthetic Stripe objects.
TENANT_TEST_DATABASE_URL='postgresql://.../local_test' npm run test:compatibility:stripe
```

Do not run the integration suites concurrently against the same database. The
Stripe runner uses USD intentionally; the default wallet runner uses CHF. The
fixture's synthetic business/contact fields follow Stripe's documented test tokens.

## M14 handoff

Keep `TENANT_AUTH_REQUIRED=false`, `ACCESS_TOKEN_FORMAT=legacy`, and no guessed
legacy registration market until reviewed backfill and compatible releases are live.
Before deploying the matching API, review existing driver country/route approvals,
resolve open-request geography, and rematch eligible open requests: migrations
create empty permission tables and deactivate historical candidate alerts. Do not
turn legacy country/profile data into automatic foreign approval. Accepted jobs
retain their selected-driver authorization as verified in M13.

Back up production, apply migrations, perform reviewed tenant/coverage preparation,
verify the server geocoder and supported payment settlement currencies, then deploy
API/admin/mobile in the documented order. Enable strict auth only after compatible
apps are live and live customer/driver ownership is complete. Final device, background
tracking, push, store-binary and production acceptance remain open.
