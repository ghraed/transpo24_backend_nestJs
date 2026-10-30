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
The driver receives CHF 5.10 before Stripe processing fees, which Stripe deducts
from the driver account under the selected fee responsibility configuration.
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
