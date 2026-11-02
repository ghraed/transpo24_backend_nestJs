# Direct driver payments

Enable with `STRIPE_DIRECT_CHARGES_ENABLED=true` only after the schema, backend,
connected-account webhook and compatible customer app have been deployed. The
flag is off when absent. Existing payment records keep their original flow;
toggling the flag never changes the Stripe account that owns an existing charge.

## Money flow

New card bookings use the existing delayed-authorization lifecycle. Saved cards
remain on the platform and are cloned to the driver account for each new
payment/authorization generation. This does not collect money on the platform.
The PaymentIntent is created on the connected merchant with manual capture and
an application fee. Its account ID is stored on the PaymentHold before any
confirmation. Every confirmation, renewal, cancellation, inspection, capture,
refund and bank-authentication action uses that stored account.

The existing 5% customer fee and 15% service-price driver commission are unchanged.
For a CHF 6 offer, authorize CHF 6.30 and collect an application fee of CHF 1.20.
The driver receives the full CHF 5.10. New accounts use
`defaults.responsibilities.fees_collector=application` and retain Stripe-managed
losses. Stripe bills payment-processing fees to the platform, reducing its
CHF 1.20 gross commission; processing fees are never added to the customer bill
or subtracted from the driver share.
Only the application fee enters Transpo24's Stripe balance. Currency conversion
happens within the account owning the charge; there is no platform transfer with
a mismatched source-transaction currency.

Customer delivery confirmation records release eligibility. The payout worker
also enforces the existing availability delay and settlement/review/dispute
checks before capturing. It then verifies the captured amount, currency and
application fee before recording the earning as paid to the Stripe account.
No Transfers API call is made for a direct payment. A bank payout is separate.
Repeated captures use the same idempotency key; repeated release accounting does
not send duplicate notifications. Existing cancellation fees and the 50/50 split
of cancellation fees are preserved by overriding the application fee on partial
capture. Authorization expiry, renewal and bank-approval conditions are retained;
this is not an indefinite escrow hold.

Approved additional card expenses use the same pinned account and existing
immediate-on-approval policy. The existing additional-expense fee is preserved
(currently zero). No second platform transfer reimburses an already direct-paid
expense. Cash expenses retain their existing cash-on-delivery handling.

New wallet bookings and top-ups are unavailable in direct mode because wallet
funding would collect customer money into the platform balance. Existing wallet
balances and historical records are preserved; they are not silently converted
or charged again. Card, Apple Pay and Google Pay saved-method setup remains
available through the existing customer flow.

## Additive schema and rollout

Apply only `20261030170000_direct_charge_account_scope` after backing up the
production database and checking migration status. It adds nullable account IDs
to `payment_holds` and `additional_charges`; it does not drop or rewrite records.
Never reset a database to resolve unrelated migration-history differences.
Regenerate Prisma, build and test the backend, and keep the previous runtime and
environment for rollback.

Deploy the customer app's `stripeAccountId` response support and scoped native
bank-authentication helper before enabling the flag. No new native dependency is
introduced; EAS Update still requires a matching installed runtime and channel.
Driver apps can use the existing payout/earnings endpoints.

Configure a **connected accounts** snapshot webhook at
`https://api.transpo24.com/webhooks/stripe/connect`. Select PaymentIntent success,
failure, cancellation and capturable updates, charge refunds, dispute events,
and account updates. Its signing secret must be separate from the platform
endpoint: `STRIPE_TEST_CONNECT_WEBHOOK_SECRET` or
`STRIPE_LIVE_CONNECT_WEBHOOK_SECRET`, matching `STRIPE_MODE`. Keep the existing
platform webhook and its secret. Incoming connected events must match the
payment's pinned account; they cannot credit platform wallets or modify another
account's payment. Account onboarding status is refreshed through the existing
V2 account sync path.

Once these prerequisites are met, enable the flag and restart the backend.
Verify one new test booking end-to-end before using real payments.

## Existing captured payments

A payment already captured on the platform cannot be turned into a direct charge.
In direct mode, unpaid legacy settlements are flagged for reconciliation and
automatic transfer retries stop. They retain their amounts, source IDs, earnings
and history. No automatic refund, migration of balances, or new customer charge
is performed. Reconciliation of those payments is a separate owner-authorized
operation, including the earlier CHF 6 bicycle booking and USD 5 booking.

## Verification

Run the backend unit suite and customer app typecheck/tests. After building,
`STRIPE_TEST_DIRECT_ACCOUNT_ID=acct_... node scripts/test-direct-charges-stripe.cjs`
checks CHF and USD authorization/capture/refund on an onboarded **test** merchant.
It refuses live credentials, uses synthetic test data only, refunds test charges
and application fees, and removes its synthetic customer. It does not use the
app database. The local schema migration was applied with all existing rows preserved.

References: [Direct charges](https://docs.stripe.com/connect/direct-charges?platform=react-native),
[cloning saved cards](https://docs.stripe.com/connect/direct-charges-multiple-accounts),
[Stripe Managed Risk](https://docs.stripe.com/connect/risk-management/managed-risk),
and [authorization and capture](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method).

## Capture reconciliation and driver history

A successful Stripe capture is not an expired authorization. The booking worker
and connected-account payment webhooks reconcile against the current intent on
its pinned account. Unexpected captures preserve the captured amount and charge
reference, put the settlement under manual review, and do not cancel or restore
the trip. No additional charge, transfer or automatic refund is performed.
Cancellation records funds as released only after Stripe confirms cancellation;
if capture wins that race, the captured payment is committed for review instead.
Expected capture retries still use their persisted operation and idempotency key.
Amount, currency and direct application fee must match before normal accounting.

`GET /driver/me/payment-history` is an authenticated, paginated history containing
held payments before an earning exists, together with captured earnings. It
returns one entry per trip and preserves the existing earnings-summary endpoint.
The driver history labels capture separately from earnings after the platform
fee. Pending entries open `/driver-trip-completed` with the original trip ID;
opening an active payment neither stops tracking nor confirms delivery. Release
still requires the existing customer confirmation, availability and review gates.
Deploy the backend endpoint before publishing the driver update. Existing
cancelled/captured inconsistencies require reconciliation; the release itself
does not restore a cancelled booking or choose a refund on behalf of its owner.

## Platform-paid processing fees rollout

For a CHF 100 service price, the customer pays CHF 105, the driver earns CHF 85,
and the platform collects CHF 20 gross (CHF 15 driver commission + CHF 5 customer
fee). Stripe processing costs are paid from that CHF 20, without increasing the
application fee to cover processing. At the published Swiss domestic-card rate
of 2.9% + CHF 0.30 on CHF 105, the illustrative processing cost is CHF 3.35 and
the platform retains CHF 16.65 before any other Connect costs. Actual Stripe
pricing depends on the account contract, card and currency conversion.

Stripe fee responsibility on existing V2 accounts is immutable. Changing account
creation code does not update previously connected accounts. Before deploying:

1. Inventory connected accounts and their fee responsibility in the matching
   Stripe mode. New accounts are configured for platform-paid processing.
2. Arrange Stripe-supported migration or replacement/onboarding for accounts
   that collect processing fees from the driver. Do not delete accounts or
   silently reassign existing payment records; account IDs remain pinned.
3. New direct bookings, authorizations/renewals, confirmations, capture and
   additional expenses fail closed unless Stripe confirms the platform pays
   processing fees. V1 compatibility permits only `controller.fees.payer=application`;
   legacy account/Express-specific fee behavior is not assumed safe. Retrieval
   failures never fall back to driver-paid processing.
4. Existing direct earnings on incompatible accounts are placed under manual
   review on release. Captured historical payments can already contain driver
   processing deductions; reconcile those actual fees explicitly before marking
   the full earnings released. This change does not reimburse past deductions,
   cancel authorizations, move funds, or charge customers again.
5. Run the backend unit suite/build and driver tests/typecheck, then verify an
   onboarded test account with the platform as fee payer, including its actual
   Stripe balance transaction. Confirm CHF 105 collected, CHF 85 driver credit,
   CHF 20 application fee and processing billed to the platform. Deploy backend
   before publishing updated driver copy. Do not deploy into an unprepared fleet:
   incompatible accounts will be unable to accept direct payments until migrated.

Reference: https://docs.stripe.com/connect/accounts-v2/connected-account-configuration
and https://stripe.com/en-ch/pricing.

### Percentage regression checks

`customer-commission.spec.ts` covers CHF 100, CHF 200, CHF 19.99 and CHF 1
through collection and delivered-trip earnings, asserting the customer fee,
driver commission, driver net and combined platform share conserve the collected
amount. `direct-charges.spec.ts` checks pricing-derived authorization and capture
amounts for CHF 100, CHF 200 and CHF 19.99 and revalidates platform-paid processing
at all three charge stages. Percentages use the original service fare; cent
rounding can slightly change the effective percentage on small fares.

The external test script includes a CHF 100 fare and inspects the captured
charge's expanded driver balance transaction. It rejects driver-side Stripe
processing fees and requires CHF 85 net with only the CHF 20 application fee
for that case. Configure `STRIPE_TEST_DIRECT_ACCOUNT_ID` with an onboarded,
platform-fee-paying test merchant settling CHF before running it. Unit mocks
cannot establish the Stripe account's real processing rate or confirm a bank
payout. CHF 3.35 processing / CHF 16.65 platform net is a pricing illustration,
not a fixed fee hardcoded by the platform.
