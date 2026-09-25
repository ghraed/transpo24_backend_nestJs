# M11 Android device verification — 2026-09-25

## Environment and limits

- Physical Xiaomi 2107113SG, Android 14 / API 34, connected over USB.
- Existing `com.transpo24.driver.dev` installation loaded current source from Metro
  on port 8082. This was not a fresh native or release build.
- Local Nest API on port 3001, isolated PostgreSQL database
  `transpo24_device_20260925_test`; all 70 migrations applied there only.
- Synthetic FR driver and CH customer/job (`device-test-trip`), CHF 100.00,
  approved CH coverage and directional permission. Accepted offer/chat fixture
  was seeded directly. This run did not test live discovery or customer selection.
- No real SMS, push recipient, payment hold or usable Stripe credential in this
  fixture. Payout worker disabled. Normal project database was not modified.
- Synthetic pickup/dropoff coordinates were positioned at the device GPS location
  for a stationary test. CH geography was fixture data, not a geocoding result.

## Observed on the physical phone and in PostgreSQL

1. Current JS bundled and app opened; active FR/CH markets loaded from the API.
2. FR test driver authenticated through the normal phone-verification UI using
   the local review-code configuration (no SMS).
3. Accepted CH job opened and displayed CHF 100.00; no tenant-equality rejection.
4. Before delivery, payout UI correctly reported that release was unavailable.
5. Native foreground GPS reached the API. Arrival acknowledgement advanced the
   request to DRIVER_ARRIVED_PICKUP and enabled pickup confirmation.
6. Android camera permission and camera launch worked. Capture was cancelled;
   successful camera capture is not claimed.
7. Android gallery selected the identified synthetic PNG; multipart pickup proof
   upload persisted a proof record and pickupConfirmedByDriver=true.
8. Job advanced through ITEM_PICKED_UP to DRIVER_GOING_TO_DROPOFF.
9. Delivery proof upload persisted the second proof record and
   deliveryConfirmedByDriver=true; request status became DELIVERED.
10. Completed-trip screen displayed success. The test driver has no Stripe account;
    payout UI correctly showed payouts disabled. No transfer was attempted.
11. 29 foreground GPS records were persisted for the synthetic trip by completion.
12. An observed temporary detail timeout recovered through Retry.

## Device-discovered defect and fix

Delivery setup depended on a callback that changed whenever requestStatus changed.
Loading ITEM_PICKED_UP therefore restarted setup during the pending start call,
issuing two start requests and displaying an erroneous status rejection even though
one transition succeeded. A deferred-response regression reproduced two starts.
The helper now receives current status explicitly, keeping setup dependencies
stable. Regression passes with one start; replay on the phone no longer displayed
the false status error.

## Validation and remaining acceptance

- 102 driver tests / 7 suites; 61 backend tests / 5 suites passed.
- Driver TypeScript/privacy, changed-file ESLint and diff whitespace checks passed.
- The M11 active-job item is complete at automated + core native-flow verification
  level. Expenses, chat and payout success/error behavior retain automated coverage;
  this phone run did not establish live expense payment, chat exchange or Stripe
  transfer success.
- Full final/release acceptance stays open: fresh native/release builds, actual
  camera capture, background tracking, Firebase push, live customer selection/chat,
  expense/payment integration and Stripe test-mode payout success.
- Installed dev binary reports missing native Firebase configuration. Background
  location was unavailable; the app displayed the foreground-tracking fallback.
- Restored original system location setting (disabled) and removed the two added
  synthetic gallery files. Test API and Metro remain running for follow-up; the
  dev app retains its synthetic test login. Isolated fixture database is retained.
- No production migration/backfill, deployment, commit or push.
