# Candidate notification delivery (M8)

Socket authentication validates the signed account and current tenant before
connection acknowledgement. Driver accounts resolve their DriverProfile using
User.id and join `driver_<profileId>`, matching the IDs used by request, rejection
and accepted-offer emitters. Customer accounts join `customer_<userId>`. Handshake
room/user/tenant fields do not select rooms. Drivers without a profile fail closed.
Trip/chat joins retain server-side participant checks; reconnect authenticates anew
and requires explicit authorized trip/chat joins. No tenant rooms authorize work.

`MatchingService.canNotify` reloads the request, requires an active NEW/SEEN
candidate, excludes existing offers, and reuses current discovery checks for
platform blocks, operational approval, driver eligibility and open/unassigned
state. Both request socket emission and each push recipient use this check.
Home-tenant equality is absent. Push recipients resolve from account to profile;
Expo token lookup remains scoped to the account, driver app and push environment.
No internal block reason is sent. Existing event names and payloads are unchanged.

Publication, open-edit and queue callbacks await socket authorization after
candidate persistence. Driver refresh also awaits socket delivery. A policy change
before delivery authorization suppresses it; provider delivery can arrive later,
so notifications never grant access. The driver notification hook routes using
requestId; review-request-details reloads via getDriverRequestDetails. A revoked
candidate or newly blocked route cannot be opened through a stale notification.
Selected-driver active-job access remains separate from new-request notifications.

## Failure and reconnect semantics

Socket/push delivery is best effort. Authorization errors suppress that recipient
and are logged; push processing continues with subsequent recipients. Existing
push-provider failures remain logged. There is no durable outbox or guaranteed
retry after process failure, and matching retries skip already-active candidates.
A committed request is not rolled back for notification failure. Drivers recover
missed events by loading the persisted candidate-backed list; reconnect does not
replay requestNew. Do not interpret dispatch connection counts as delivery receipts.
Exactly-once delivery is not claimed. Live socket/device Expo delivery was not
exercised by this milestone's mocked transports.

## Verification

API unit/HTTP suites cover authenticated identity, profile room mapping, denied
room joins, reconnect rejection, participant event targets, candidate authorization
and per-recipient failure isolation. The additional M8 scenario in
`scripts/test-request-matching.cjs` uses real PostgreSQL candidates, distinct
account/profile IDs, an FR driver with approved CH coverage, mocked socket/push
transports, route-block revocation, inactive candidates and accepted-job suppression.
The same scenario checks stale detail access through DriverService.

Run against a migrated disposable local database only:

```sh
TENANT_TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55439/notifications_test MATCHING_TEST_REDIS_PORT=55440 node --test scripts/test-request-matching.cjs
```

M9 remains responsible for direct offer policy/currency enforcement and the full
selected cross-tenant driver's lifecycle. Production rollout remains pending.
