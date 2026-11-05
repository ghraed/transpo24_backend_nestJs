# What needs a person — staging acceptance

The local test system and connected Android phone can be used for synthetic checks. The live apps, real users and real payments are outside this task.

## Current owner progress

The owner identified live Firebase project `transpo-24`, then created separate **transpo24-staging** and downloaded both valid staging Android configurations. Those files were privately copied, validated, and included in fresh local APKs. The live project's registrations were left intact. Billing state remains unverified; no browser connection is available for console operations.

## Current Android push blocker

The owner requested reuse of the local key and explicitly approved uploading it to Expo for both staging apps. This is complete: `com.transpo24.app.staging` and `com.transpo24.driver.staging` now have that FCM V1 assignment, with production assignments unchanged. The key belongs to project **transpo24**; the owner granted its principal messaging-admin permission in **transpo24-staging**, and a validate-only Google check passed. No key contents are in reports/chat.

The source API enablement is complete: the owner reported enabling it, and the next real sends no longer report SERVICE_DISABLED. Both retries instead report **IAM_PERMISSION_DENIED / cloudmessaging.messages.create / projects/transpo24**. The current Expo path targets the existing key's project, while the APKs register with **transpo24-staging**. Target-project direct validation still succeeds; it is not proof Expo targets that project.

The owner confirmed: **continue using the existing key**. The previously suggested new-key action is canceled; do not ask for or create a replacement key. The current Expo delivery path remains blocked until a supported way is found to target `transpo24-staging` with the existing credential. Broader source-project grants or changing credential project metadata would not establish that the Expo request targets the staging project. No such change has been made.

[Google cross-project requirements](https://firebase.google.com/docs/cloud-messaging/send/v1-api#authorize_a_service_account_from_a_different_project) require the target project's send endpoint. [Expo credential setup](https://docs.expo.dev/push-notifications/fcm-credentials/) and [sender checks](https://docs.expo.dev/push-notifications/sending-notifications/#push-receipt-errors) describe matching credentials to the app's Firebase configuration. The observed failure is IAM_PERMISSION_DENIED for projects/transpo24, not a returned MismatchSenderId error. Direct FCM is a possible separate engineering path, but would change the delivery integration and would not by itself establish acceptance of the current production Expo path.

A read-only before/after check verified 38 local configuration/key files and the queried nonlegacy Android credential records, including their signing and submission bindings, in the two Expo projects. Other Expo projects and iOS credentials were not queried. See `production-local-protection.json`; this is a bounded comparison, not a guarantee of all production behavior.

## Other precise prerequisites

- **Maps/routing:** confirm staging-only Android Maps SDK keys restricted to these two package names and the local test signing SHA-1 `5e8f16062ea3cd2c4a0d547876baa6f38cabf625` (both APKs; see each `*-firebase-signature.log`); iOS keys restricted to staging bundle IDs; server Routes/Places/Geocoding key restricted to the staging API's outbound IP. Existing local key strings were found, but their project/restrictions/billing/API permissions have not been verified. Supply secure file paths or configure a private staging env file; never paste keys into chat. Real outdoor/locked-screen movement needs you to carry the phone on a safe route and report the timing/conditions.
- **SMS:** identify one number you control that may receive test messages, and confirm the selected Twilio Verify project/service is for this test and permits that destination. No real SMS has been sent. The synthetic review-code login used for chat proves no SMS delivery.
- **Stripe TEST:** the existing explicit TEST key authenticated and is now configured privately, with the matching customer TEST build and official CLI forwarding. No additional key is being requested. The CLI supplies one shared signing secret for both scopes; independent deployed endpoint credentials remain a release prerequisite. Native TEST 3DS2 approval/cancellation and force-stop before/after success with recovery now have scoped evidence on the provider-connected local stack. Capture/refund/fee/payout, durable webhook forwarding and complete journeys remain open. No live keys or real charges are permitted.
- **iOS:** this is a Linux host. A Mac with Xcode compatible with SDK56, an Apple team, registered test iPhone, staging bundle IDs/signing profiles and APNs credentials are needed. No signed iOS artifact/device is available here. Store submission is not authorized.
- **Translation/accessibility:** an Italian speaker must review the AI draft and record corrections/acceptance. A person should verify TalkBack/VoiceOver announcements, large text, focus order, contrast, all six languages and RTL in complete journeys. Automated parity is not that review.
- **Operations:** authorized operators must supply realistic backup/restore timing, uploads restore, alert delivery, reconciliation and coordinated compatible API/worker/mobile rollback evidence. The current local stack does not establish production RPO/RTO.

Only request the next needed action as each stage becomes runnable. Do not ask a person to approve a release while any of these release gates lacks evidence.
