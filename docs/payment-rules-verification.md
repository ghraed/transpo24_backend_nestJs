# Payment rules and release evidence

The backend supplies `GET /customer/payment-policy`, a policy on request/payment responses,
and persisted confirmation deadlines. The client renders contextual information with
`PaymentInfo`; opening or dismissing it never initiates a financial action.

`DELAYED_BOOKING_AUTHORIZATION_ENABLED` defaults to false. Integration scripts do not change persistent configuration. Local Stripe test-mode
activation at the user’s request is recorded below. Legacy captured bookings keep their
capture-based cancellation clock. New delayed bookings retain their policy after the flag
is switched off, and their background jobs continue processing.

## Rule-to-behavior checklist

Every row is a release requirement. Changes to a rule must update its enforcing behavior,
structured policy, translated explanations, and the corresponding behavioral test.

| Popup rule | Enforcing behavior | Passing evidence |
| --- | --- | --- |
| No booking hold or charge for 10 minutes | `stage`, `process` and persisted `authorizationDueAt`  [Code](../src/payments/delayed-booking-payments.service.ts). | Lifecycle unit tests; PostgreSQL concurrent-acceptance integration  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| Free cancellation before assignment | Persisted cancellation operation, zero capture, hold release  [Code](../src/payments/delayed-booking-payments.service.ts). | Lifecycle free-cancellation tests and PostgreSQL integration  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| Check funds after the countdown | Manual Stripe authorization; locked wallet available-balance check  [Code](../src/payments/delayed-booking-payments.service.ts). | Stripe API integration; competing PostgreSQL wallet authorizations  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| Bank authentication has five minutes; failure/timeout cancels without a fee before assignment | Same-intent SDK authentication, persisted approval deadline, `failApproval`  [Code](../src/payments/delayed-booking-payments.service.ts). | Stripe API authentication fixture; lifecycle success/failure/timeout tests; client approval-action test  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| Driver receives acceptance and chat only after funds are secured | Locked finalization, persisted driver notification marker  [Code](../src/customer-requests/customer-requests.service.ts). | PostgreSQL integration checks assignment, chat, details, and notification count before/after hold  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| 15% from minute 10 through hour 24; 50% afterward | Shared fee constants, countdown-start timestamp, persisted operation amount  [Code](../src/payments/payment-policy.ts). | Lifecycle boundary tests; Stripe partial-capture integration; PostgreSQL duplicate cancellation  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| A changed cancellation quote requires renewed review | Locked amount/version validation before capture  [Code](../src/payments/delayed-booking-payments.service.ts). | Lifecycle stale-quote test  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| Capture only the fee; release the rest of an uncaptured hold | Stripe partial capture / wallet reservation release  [Code](../src/payments/delayed-booking-payments.service.ts). | Stripe API and PostgreSQL integration  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| Held, released, and fee-captured amounts are reported separately from refunds | `AUTHORIZED`, `RELEASED`, `CANCELLED_WITH_FEE`; capture reconciliation uses actual captured amount  [Code](../src/admin/admin.service.ts). | Admin reconciliation unit test; PostgreSQL integration  [Tests](../src/admin/admin.service.spec.ts). |
| Historical collected payments use refunds | Existing collected-trip refund path and capture-based policy  [Code](../src/payments/payments.service.ts). | `booking-policy`, `paid-booking-policy`, `reservation-refund`, and payment-service suites  [Tests](../src/payments/reservation-refund.spec.ts). |
| Cancellation after pickup requires review | Manual-review settlement state; no automatic release  [Code](../src/payments/delayed-booking-payments.service.ts). | Lifecycle post-pickup cancellation and renewal tests  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| Capture at client-confirmed delivery; rating does not confirm delivery | Delivery-confirmation capture operation; separate rating endpoint  [Code](../src/trips/trips.controller.ts). | Lifecycle and PostgreSQL delivery tests; PostgreSQL rating-without-capture assertion; delivery and payout suites  [Tests](../src/trips/delivery-confirmation.spec.ts). |
| Payout requires captured funds and preserves delivery allocation | Settlement stays uncollected until capture; payout settlement gate  [Code](../src/payments/payments.service.ts). | PostgreSQL delivery-allocation test; existing payout retry/commission suites  [Tests](../src/payments/commission-payout-retries.spec.ts). |
| Renew before actual card authorization expiry | Stripe `capture_before`, renewal generation, replacement before old-hold release  [Code](../src/payments/delayed-booking-payments.service.ts). | Lifecycle renewal success/failure tests; Stripe API expiry assertion  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| Renewal failure cancels for free before pickup or goes to review afterward | `authorizationFailed`  [Code](../src/payments/delayed-booking-payments.service.ts). | Lifecycle renewal decline tests  [Tests](../src/payments/delayed-booking-payments.service.spec.ts). |
| Early furniture reservation remains unpaid; original deadline is enforced | Existing reservation flow; held payment recognized during reconciliation  [Code](../src/customer-requests/furniture-reservations.service.ts). | Furniture reservation suite; delayed deadline tests  [Tests](../src/customer-requests/furniture-reservations.service.spec.ts). |
| Top-ups charge immediately and credit only confirmed success | Top-up PaymentIntent; locked, idempotent success credit; atomic balance increment  [Code](../src/payments/payments.service.ts). | Existing top-up tests; PostgreSQL concurrent/duplicate top-up events  [Database tests](../scripts/test-delayed-booking-database.cjs). |
| Additional expenses charge a saved card immediately or record cash due at delivery | Existing explicit approval and payment-option branches  [Code](../src/payments/payments.service.ts). | `additional-expense-payments` behavioral suite; PostgreSQL duplicate reconciliation; Stripe intent integration  [Tests](../src/payments/additional-expense-payments.spec.ts). |
| Saving a card does not authorize the booking amount | Customer-bound SetupIntent  [Code](../src/payments/stripe.service.ts). | Stripe API assertion that no PaymentIntent exists after setup; saved-card tests  [Tests](../src/payments/saved-cards.spec.ts). |
| Popups cannot move money; all languages have matching placeholders | Reusable read-only popup and six catalogs  [Client code](../../client_mobile/src/components/payment-info.tsx). | `payment-info.test.js` covers every context and all six catalogs  [Tests](../../client_mobile/src/components/payment-info.test.js). |
| Countdown survives app closure and device-clock differences | Server timestamps, monotonic elapsed time, foreground refresh  [Client code](../../client_mobile/src/components/booking-payment-status.tsx). | `booking-payment-status.test.js`; real Redis worker-restart integration  [Tests](../../client_mobile/src/components/booking-payment-status.test.js). |

Bank statement availability is controlled by the issuer. The app promises no fixed or
instant release/refund completion time. A replacement card authorization can temporarily
overlap its predecessor; the popup explains this.

## Notifications after funds are reserved

For ordinary bookings, the worker completes assignment after a successful card or wallet
hold, then sends `BOOKING_FUNDS_RESERVED` to the client and `DRIVER_SELECTED` ("Offer
accepted") to the selected driver. Neither acceptance message is sent during the countdown,
while bank approval is pending, after a decline, or before assignment. The furniture
reservation exception keeps its existing payment-confirmed messages.

The client and driver have separate persisted notification timestamps and separate
transactions. A failed recipient retries without rolling back the other recipient's
successful marker. Card authorization renewal does not repeat booking acceptance.
Client Alerts store one update even without a registered push device. Retryable Expo ticket
failures propagate to the worker; invalid/unregistered device tokens follow existing cleanup.

Evidence: [lifecycle timing and retry tests](../src/payments/delayed-booking-payments.service.spec.ts),
[recipient and provider dispatch tests](../src/notifications/notifications.service.spec.ts),
[client Alerts persistence tests](../src/notifications/customer-notifications.spec.ts),
[PostgreSQL/Redis integration](../scripts/test-delayed-booking-database.cjs),
[client tap routing](../../client_mobile/src/notifications/notificationRoute.test.js), and
[driver tap routing](../../driver_mobile/src/notifications/useNotificationNavigation.test.js).
The additive `20261028010000_booking_hold_notifications` migration was applied locally.
Post-hold checks passed: 1001 backend tests, 17 client routing tests, 19 driver routing tests,
PostgreSQL/Redis integration, API build/lint, and Prisma validation.

## Automated checks

- API: `npm run test:unit`, `npm run lint:check`, `npm run build`, `npm run prisma:validate`.
- Client: `npm test`, `npm run lint`, `npm run typecheck` (includes privacy source checks).
- `npm run test:payments:database`: refuses a remote database; creates a disposable schema
  and uniquely named Redis queue. It verifies the additive migration, real transaction
  locks, assignment, chat creation, cancellation, delivery capture, top-up idempotency,
  additional-expense recovery, and worker restart. It removes its schema and queue afterward.
- `npm run test:payments:stripe`: refuses live keys. It checks actual Stripe setup,
  authorization, expiry, release, partial/full capture, idempotency, decline, and SDK
  authentication-required outcomes. Test charges are refunded and fixtures removed.

Android evidence: the development APK built successfully, and the countdown and scrolling English popup were inspected on the connected device using an isolated fixture screen. The temporary screen and layout harness were removed afterward. Native bank sheets, iOS, and the complete accessibility/RTL walkthrough remain release gates.

## Local verification record — 28 October 2026

- Backend regression: 1001 tests across 81 suites; 21 end-to-end checks. Client regression: 553 tests across 73 suites.
- API build, Prisma validation, client typecheck/privacy checks, and mobile lint passed.
- Stripe test-mode checks passed for setup, manual authorization, release, partial/full capture, decline, and authentication-required outcomes.
- Local PostgreSQL/Redis integration passed, including concurrent spending and cancellations, reservation cancellation after authorization, and worker restart. Disposable fixtures were removed.
- The additive migration was applied to the local development database. At the user’s request, delayed authorization is now enabled in the local `.env` for Stripe test mode. The local API was restarted; an authenticated policy request returned `AFTER_COUNTDOWN`, 600 seconds, and `FUNDS_SECURED`. Database readiness passed and Redis reported one registered booking worker. The disposable verification customer was deleted. Production configuration and the default-off `.env.example` were not changed.
- iOS, native wallet sheets and 3DS challenge interaction, screen-reader behavior, and the full Arabic/large-text device walkthrough have **not** been accepted.

## Deployment and remaining native acceptance

1. Deploy the additive migration before deploying API queries that select the new fields.
2. Deploy compatible client and driver apps. Older clients cannot start delayed payments
   without acknowledging the new policy; they receive a review/update error rather than
   an early charge.
3. Confirm Redis and both booking/payout workers are operational. New delayed confirmations
   are rejected when their booking worker is unavailable.
4. Complete native iOS/Android acceptance with Stripe test mode: new/saved cards, Apple Pay,
   Google Pay, actual 3DS approval/cancellation, notifications, background/reopen, large
   text, VoiceOver/TalkBack, Arabic layout, and bank-approval deep links. Headless Stripe
   checks do not replace the native bank-authentication sheet walkthrough.
5. Enable the production flag only after native acceptance is recorded. Monitor overdue grace/approval
   records, repeated worker failures, unsettled cancellation/delivery operations, unnotified
   assignments, expiring authorizations, and manual-review settlements. The booking recovery sweep emits structured warning counts for overdue confirmations/approvals, unreleased holds, unsettled captures, and expired authorizations; worker/notification failures and authorization failures are logged separately.

Disabling the flag stops new delayed bookings; it does not capture, cancel, or abandon
existing ones. Do not delete the queue or persisted confirmation records to roll back.
