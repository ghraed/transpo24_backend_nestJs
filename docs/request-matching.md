# Request matching and candidate discovery (M7)

`MatchingService` composes operational approval with the existing vehicle/load,
vehicle-document, radius, schedule, online and profile predicates. Deleted users,
unapproved drivers, unresolved geography and closed/assigned requests cannot
produce new candidates. Pickup and dropoff approval plus the exact directional
route are required, including domestic routes. Home tenant is never a matching
filter. Platform routes remain allowed unless an applicable active block exists.

## Candidate storage and discovery

`DriverRequestAlert` is the RequestCandidate equivalent. Its existing unique
request/driver pair and foreign keys are reused; `isActive` and `matchedAt` record
matching authorization separately from NEW/SEEN/ACCEPTED/IGNORED/EXPIRED UX status.
The additive `20260924190000_request_candidates` migration adds candidate lookup
indexes and an indexed country/direction/status request lookup. Existing alerts
start inactive; historical alerts do not automatically authorize foreign discovery.
No old migration, historical request, offer, payment or selected driver is changed.

Driver list queries require an active candidate. List/detail access rechecks
current platform policy, operational permissions, driver status and existing
eligibility (known candidates may be read offline). A candidate only authorizes
its request. Selected drivers retain the existing active-job detail path.
Open-request edits expire candidate authorization and rematch updated details.

Publication filters drivers by approved operational directions in SQL before
loading their vehicle/schedule data. Driver refresh reads only approved directions
in pages of 100, skips existing active candidates/offers/dismissals, and bulk-loads
route blocks per page. Discovery batches candidate and policy reads rather than
querying each request separately. Candidate upserts use the existing unique key.

## Queue and rollout

`MATCHING_QUEUE_ENABLED=false` preserves synchronous publication and the existing
immediate dispatch summary. Set it to `true` with `REDIS_HOST`, `REDIS_PORT`, and
optional `REDIS_PASSWORD` to enqueue publications in `request-matching` using
BullMQ. Queued publication returns without an immediate dispatch summary.
Failed enqueue falls back to synchronous matching. Open edits still rematch inside
their existing transaction. No matching/queue feature flag bypasses eligibility.

Jobs contain only `{ requestId }`. The worker locks and reloads the request,
checks current policy/approvals, persists candidates, commits, then emits existing
events/pushes. Retries skip already-active candidates; concurrent worker attempts
for a request serialize on its row. A block activated before processing prevents
new candidates. Accepted/in-progress jobs are not cancelled or rematched.

Apply the additive migration and explicitly review existing drivers' countries
and routes before deploying enforcement. M6 initialization creates PENDING rows,
which do not authorize matching. Historical geography must be reviewed/backfilled;
missing countries fail closed. This milestone alone is not production readiness.

M8 now verifies socket room identity, candidate targeting and reconnect behavior;
see [notification delivery and recovery](request-notifications.md). Current post-commit
notifications have no durable outbox: a delivery failure after candidate commit
is not retried by candidate creation. M9 now enforces direct offer/current-policy
and request-currency checks; see [offer/lifecycle verification](offer-lifecycle.md).

## Reproduce verification

Use a migrated disposable local PostgreSQL database ending in `_test`:

```sh
TENANT_TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:55439/matching_test npm run test:matching:integration
```

Set `MATCHING_TEST_REDIS_PORT` to an explicitly isolated local Redis port (not
6379) to run the eighth scenario using a real BullMQ worker. Without that variable,
only the Redis scenario is skipped. Never point these checks at live services.
The script cleans its request/user/block fixtures and reuses existing reference
countries/services without deleting them.

Coverage includes FR-home/CH-job eligibility, request-specific discovery denial,
revoked approvals and flags, exact direction/type policy, stale queued work,
idempotent concurrent workers, pagination beyond 100 jobs, legacy alerts,
existing offers/dismissals, accepted jobs, documents/capacity/radius/schedules,
soft-deleted accounts, and real Redis delivery. Existing M1–M6 database scripts
and API unit/HTTP suites provide the regression checks.
