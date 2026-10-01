# Offers and selected-driver lifecycle (M9)

The direct driver offer endpoint now calls `MatchingService.assertCanOffer` inside
its existing request-row-locked transaction. It reloads current active candidate,
profile/account, approved countries and exact direction, platform route policy,
vehicle/documents, capacity, radius, schedule and open/unassigned request state.
Known candidates retain the existing offline offer behavior. Home tenant equality
is never required. The accepted-alert, request-version, price/ETA and duplicate
checks remain in place, as do customer socket and push notifications.

An applicable active block returns generic `ROUTE_BLOCKED`, without the internal
reason. Missing/inactive candidates or revoked eligibility return
`REQUEST_ACCESS_DENIED`. Policy is read from the database without a cache; these
checks evaluate current committed state, not a global serialization lock against
concurrent admin policy/coverage writes.

Offers persist the driver's home-market default currency. The driver request
details response supplies `offerCurrency`, and the API checks that currency when
the offer is submitted. An omitted/null optional currency uses the driver's
home-market currency; a supplied conflicting currency or missing/unsupported
driver-market currency returns `CURRENCY_MISMATCH`. The request's pickup currency
remains geography metadata and does not set an offer's charge currency.

The customer sees and accepts the offer amount in its original currency. Card
payments use that same offer currency; the card issuer can convert the charge for
a cardholder with another account currency. Issuer conversion and fees do not
change the offer amount or the platform's recorded driver earnings. A driver
payout may separately incur conversion or bank fees. The wallet requires the
same currency as the offer and cannot perform foreign exchange.

Offer lists retain each currency. A lowest-price summary is shown only when
all active offers use one currency, because numeric prices in different
currencies are not comparable without an exchange rate. No in-app exchange
conversion or historical currency backfill occurs. Production payout readiness
still needs verification for each enabled offer currency, including Stripe's
source-charge settlement currency and the linked driver transfer.

Selected-job access continues to use customer ownership and assigned driver IDs,
independent of candidate activation, current route blocks, or tenant equality.
Existing lifecycle/payment methods were preserved. No new route check was added
to accepted trips. The database regression follows a FR-home driver through a CH
job, wallet-funded selection, then adds a route block and removes candidate access.
It exercises chat, tracking, arrival, pickup/delivery photos, expenses and customer
approval, delivery approach, delivery confirmation, rating, earning creation,
payout scheduling and due-balance release. Unrelated users are denied. GPS updates
across the border leave home tenant and operational approvals unchanged.

## Reproduce

Use a migrated disposable local PostgreSQL database ending in `_test`:

```sh
TENANT_TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55439/m9_test npm run test:offer-lifecycle:integration
```

Seven database scenarios cover direct offer authorization, newly blocked routes,
request currency, omitted/null/missing currency, existing offer validations,
selected-driver lifecycle, and GPS tenant immutability. The harness cleans owned
fixtures. Notifications and payout queue delivery are recorded stubs; wallet and
lifecycle persistence are real. Stripe calls fail immediately if attempted. Photo
metadata is exercised, not HTTP multipart upload or device capture. Actual external
payout transfer, native mobile behavior and production rollout are not claimed.

Validation: 527 unit tests in 47 suites with coverage, 14 HTTP tests, seven M9
PostgreSQL scenarios and 38 earlier database scenarios passed; one existing Redis
scenario was skipped. Build, TypeScript and Prisma validation passed. The matching
service and adjusted unit fixture pass ESLint; the driver service retains seven
pre-existing formatting/nickname errors outside this change. All 70 migrations
were applied only to disposable PostgreSQL 16. No schema, production, mobile or
admin changes, backfill, commit or push.
