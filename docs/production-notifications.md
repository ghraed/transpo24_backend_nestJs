# Production notification verification

Checked 2026-09-11.

## Hosted credentials

- Customer Android (`com.transpo24.app`): FCM V1 credential was missing. Assigned the existing `transpo-24` Firebase service account in EAS and read back the assignment.
- Driver Android (`com.transpo24.driver`): matching FCM V1 credential already assigned in EAS.
- Customer and driver iOS: no app credentials configured and no APNs push keys available in the EAS account. An Apple Developer account or APNs key is required to finish setup with `eas credentials --platform ios` in each app directory.

Credential assignment is verified; credential validity and end-to-end delivery are not established by this check.

## Code changes

Both mobile apps retry registration failures with bounded backoff, refresh registration on foreground and native token changes, and cancel retries on logout. Automatic retries do not request notification permission again. Android notification channels explicitly use default sound.

Customer builds now fall back to the checked-in `google-services.json`. Both Android build configurations reject Firebase files that do not contain their application package. Customer notifications now use `transport_jobs` as the native default channel.

Backend push payloads request default sound on Android and iOS. The Expo client accepts optional `EXPO_ACCESS_TOKEN` for projects using enhanced push security; keep this server-side.

## Validation and remaining release work

Registration lifecycle regression tests, mobile typechecks, focused lint checks, backend notification/token tests, and backend build passed. Both resolved Expo configs contain the expected Firebase files, project IDs, and notification plugins. Mismatched Firebase package configurations were rejected in negative checks.

No Android device was connected. No push messages were sent. No mobile build, OTA update, or backend deployment was performed.

1. Configure Apple push credentials before releasing iOS apps.
2. Build and install updated production mobile binaries; native Firebase/plugin changes require a rebuild. Deploy the backend changes.
3. On designated test accounts, allow notification permission and verify backend token registration for CUSTOMER and DRIVER.
4. With authorization to send test notifications, verify an offer/customer notification and a job/driver notification in foreground, background, and after normal app termination; check sound, visible notification, and tap navigation.
5. Retry registration after an offline start and after enabling permission in system settings. Verify delayed Expo delivery receipts, not only accepted tickets. The current backend receipt lookup is immediate, so a receipt may not yet be available.

References: https://docs.expo.dev/versions/v56.0.0/sdk/notifications/ and https://docs.expo.dev/push-notifications/push-notifications-setup/
