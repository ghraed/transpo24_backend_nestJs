# Stripe test payments in a production deployment

Stripe mode is independent of `NODE_ENV`. Keep `NODE_ENV=production`, HTTPS,
authentication, CORS and the normal production app/API URLs. Select Stripe test
credentials explicitly to exercise booking, saved cards, wallet funding and
Connect without moving real money. Use Stripe test cards, not real cards.

## Remote activation — 2026-10-29

The API at `https://api.transpo24.com` now runs with `STRIPE_MODE=test` and the
supplied test webhook signing secret. The values are stored in
`/opt/transpo24-api/.env` on the remote server, with live credentials retained in
the `STRIPE_LIVE_*` slots. Legacy active key/webhook variables also point to test
values for compatibility with operational scripts. No secret values are recorded
in this document or Git.

Only Stripe credential selection, production validation, webhook mode/signature
validation and the existing test payout-delay selection were deployed, using a
staged copy of the actual production source. Existing business/payment logic,
dependencies and database schemas were preserved. The service is
`transpo24-api.service`.

The staged build and 34 tests passed. The test API key authenticated with Stripe,
and the matching enabled test webhook destination has 9 events. The restarted
API accepted a correctly signed test configuration-probe event and rejected both
a live-mode event and an invalid signature. The probe type is ignored by the
business handler and does not change payment, booking or customer records.
Invalid signatures now return HTTP 400 instead of the previous HTTP 502.

Protected rollback files (prior environment, source and runtime) are at
`/opt/transpo24-api/.codex-backups/stripe-test-20261029-124944`.
The client EAS production environment selects test credentials, but installed
clients still need a compatible rebuild/update to use those values.

## Variables

The API and client each have `.env.stripe-production.example` with both key slots.
Ignored `.env.stripe-production.local` overlays were also prepared from the local
test keys. These custom filenames are **not automatically loaded** by Nest or
Expo. They are source files for copying values to the deployment configuration.
They contain only Stripe settings; do not replace the server's entire environment
with an overlay. Real keys must stay out of Git.

| Location | Owner testing | Real payments |
| --- | --- | --- |
| API selector | `STRIPE_MODE=test` | `STRIPE_MODE=live` |
| API key | `STRIPE_TEST_SECRET_KEY=sk_test_...` | `STRIPE_LIVE_SECRET_KEY=sk_live_...` |
| API webhook signing secret | `STRIPE_TEST_WEBHOOK_SECRET=whsec_...` | `STRIPE_LIVE_WEBHOOK_SECRET=whsec_...` |
| Client selector | `EXPO_PUBLIC_STRIPE_MODE=test` | `EXPO_PUBLIC_STRIPE_MODE=live` |
| Client key | `EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY=pk_test_...` | `EXPO_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...` |

An explicit selector requires the corresponding named key with the correct prefix.
Missing keys and mode/key mismatches fail instead of falling back to legacy keys.
The webhook uses the same selector; signed events from the opposite mode are rejected.
Without selectors, existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` remain supported. Production still requires
live legacy credentials unless test mode is explicitly selected. `play-test`
client builds still require test credentials.

## Enable owner testing

The auto-loaded local client `.env` / `.env.local` and API `.env` now explicitly
select test credentials. The client's EAS production environment also selects
`EXPO_PUBLIC_STRIPE_MODE=test`, has the test key in the named test slot, and
preserves the previous live publishable key in the named live slot. These
environment changes do not update an installed app. The local API `.env`, private
overlay and remote API environment now contain the supplied test endpoint secret.

1. In the Stripe Dashboard, select the test environment/sandbox. Use its matching
   publishable and secret keys for the same account. The prepared private overlays
   contain the current local test keys; confirm both belong to that account.
2. Configure a **test** webhook destination at
   `https://api.transpo24.com/webhooks/stripe`, with the events required by the
   existing integration. Copy that destination's signing secret into
   `STRIPE_TEST_WEBHOOK_SECRET`. This is now configured using the supplied secret.
   A `stripe listen`
   signing secret is for local forwarding and cannot validate Dashboard delivery.
3. Merge the API overlay's variables into the production server's environment,
   preserving its existing non-Stripe settings. Restart/redeploy the API with
   this code. Production startup requires a webhook signing secret even in test mode.
4. Add the client overlay's variables to the **EAS production environment** using
   the Expo dashboard. Publishable keys and the selector can use plain text
   visibility. Secret API keys and webhook secrets belong only on the API server.
   Local Android release builds also need these values in their build environment.
   Export the overlay before the build, for example from the client directory:

   ```sh
   set -a
   . ./.env.stripe-production.local
   set +a
   npm run ios:release:check
   npm run release:build
   ```

   The release shortcut uses EAS production values too, so update EAS before running it.
   Existing production profiles, including `production-apk`, accept explicitly
   selected test credentials. The iOS release checker uses the same selection.
5. Install the new release build for testing. Expo embeds `EXPO_PUBLIC_*` values
   when bundling; editing server variables does not change an installed client.
   A compatible EAS Update must also use the same EAS production environment.
6. Use dedicated test users and Stripe test cards, such as `4242 4242 4242 4242`
   with a future expiry and any three-digit CVC. Check payment, refund, saved-card,
   wallet and driver Connect flows, and confirm events have `livemode=false` in
   Stripe. Google Pay now selects its test environment from the key, including in
   release builds. Apple Pay still needs its existing merchant/device setup.

## Verify the customer, driver and platform split

### Driver account creation with Stripe-managed risk

The selected Connect configuration is direct charges, Stripe-managed negative
balance liability, Stripe collecting processing fees from drivers, Express
Dashboard access, and Stripe-hosted onboarding. New driver accounts use Accounts
v2 with the merchant/card-payments configuration, `losses_collector=stripe`, and
`fees_collector=stripe`. There is no fallback that accepts platform liability.
The optional platform loss-liability acknowledgement is not needed for this
configuration.

Express with Managed Risk currently requires `2026-10-28.preview`. This version
is pinned only on the Connect account creation, retrieval and onboarding-link
requests. Existing customer payment and webhook API versions are unchanged.
The installed Stripe SDK still describes `use_case.account_onboarding.configurations`,
which the preview rejects, so onboarding links use the SDK's raw-request method
with the documented current body. Driver country comes from the saved profile;
Accounts v2 requires it before applying the merchant configuration. Drivers
without a country must complete their profile before creating an account.

Status refresh maps V2 merchant/card-payment and bank-payout capabilities to the
existing mobile response fields. User information currently due keeps onboarding
incomplete; verification awaiting Stripe is distinct from missing user input.
Closed accounts are never payout-ready. Explicit V1 compatibility errors permit
retrieval and onboarding of existing legacy accounts using V1. Other Stripe
errors are returned without silently changing account responsibilities. The
Dashboard action uses an Express login link.

After building, run `node scripts/test-stripe-connect.cjs` with explicitly selected
Stripe test credentials. The check refuses live mode, creates one synthetic
connected account, verifies the responsibility settings and onboarding link,
then closes the fixture. It does not write app data or create payments.

**Rollout scope:** this change enables account creation and onboarding only.
The existing production payment code uses platform charges followed by transfers.
The direct-charge migration is implemented behind `STRIPE_DIRECT_CHARGES_ENABLED`;
follow [the coordinated rollout](stripe-direct-charges.md) before enabling it. Completing onboarding does not complete the
payment migration. Trip-completion, release, commission, cancellation and dispute
conditions are unchanged by this onboarding change. Existing balances and
payments must not be moved between accounts as part of account setup.

References: [Stripe Managed Risk account creation](https://docs.stripe.com/connect/risk-management/connected-accounts-with-managed-risk),
[V2 onboarding links](https://docs.stripe.com/api/v2/core/account-links/create),
and [Managed Risk payment compatibility](https://docs.stripe.com/connect/risk-management/managed-risk).

The driver app has no Stripe SDK or active publishable-key integration. Its
Connect onboarding, account sync and payout requests call this API, which uses
the same selected Stripe secret key as customer payments. Both apps must point
to the same API. No independent driver-side Stripe mode switch is needed.

Use one dedicated test customer and one dedicated test driver:

1. From the driver app, open **Stripe Connect**, create an account and complete
   test onboarding while the API is in test mode. Use a test connected account
   in the same Stripe environment as the platform; do not reuse a live account.
2. Have that driver offer a service price of 100, without extra expenses.
   The customer total should be 105, including the existing 5% customer fee.
3. Pay with a Stripe test card and complete the normal booking/delivery flow.
   Have the paying customer confirm successful delivery so the payout is eligible.
4. Check driver earnings: service price 100, platform deduction 15 (15%), driver
   net earnings 85. Check the settlement: customer collection 105, driver share
   85, platform share 20 (15 from the driver price plus 5 from the customer).
   These are the existing business rules, unchanged by Stripe mode.
5. Once payout eligibility and Connect onboarding permit it, release the funds
   from the driver app. Verify a **test** transfer of 85 to the connected account
   in Stripe and a completed transfer in the app. Stripe processing fees are
   separate from the 5%/15% commissions; 20 is the platform share before those fees.
6. Retry payout release and verify it does not transfer twice. Test refunds and
   unsuccessful payments separately before repeating the delivery scenario.

Stripe test payouts simulate bank payout behavior without sending money to a
real bank. Test mode uses the same commission code as live mode. The automated
`customer-commission.spec.ts` tests cover collecting 105, allocating 85/20 and
transferring only the driver's net; `commission-payout-retries.spec.ts` covers
eligibility and repeated payout requests.

An existing webhook secret can be copied into `STRIPE_TEST_WEBHOOK_SECRET` only
if it is the real `whsec_...` signing secret for that same test destination.
Stripe uses different signing secrets for live/test destinations, even when
they share a URL, and Stripe CLI forwarding uses its own secret. Placeholder
values cannot verify events. The API accepts
snapshot events, so select the snapshot payload format when configuring the
Dashboard destination.

## Switch to real payments

Populate the live slots, including the **live endpoint's** webhook signing secret.
Change both selectors to `live`, restart the API and rebuild/update the client
with the matching configuration. Coordinate the switch so old test clients do
not make payments against a live API. Do not change `NODE_ENV` to switch Stripe.

Stripe customers, payment methods, intents and Connect accounts are scoped to
their Stripe environment. This change does not migrate or partition database
records by mode. Testing against the production database can create app wallet
balances, bookings, payment records and test Connect IDs. Use dedicated test
users, keep them out of real transactions, and reconcile their data before going
live. Do not resume test payment records or reuse test saved cards/Connect
accounts with live credentials. Test mode also retains the existing zero-hour
driver payout-delay default; set `DRIVER_PAYOUT_DELAY_HOURS=24` explicitly if the
owner needs the live timing behavior during testing.

References: [Stripe API keys](https://docs.stripe.com/keys),
[Stripe testing](https://docs.stripe.com/testing),
[Stripe webhook signing secrets](https://docs.stripe.com/webhooks#verify-official-libraries),
[Stripe Connect testing](https://docs.stripe.com/connect/testing),
[Expo environment variables](https://docs.expo.dev/guides/environment-variables/),
[Expo SDK 56 Stripe integration](https://docs.expo.dev/versions/v56.0.0/sdk/stripe/).
