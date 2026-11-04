# Remediation contracts and rollout notes

4 November 2026. These source changes are not a production deployment or release approval.

## Consent

New customer and driver phone verification (including login creating an account), email registration and legacy driver registration require `acceptedTermsVersion`. The server records the authenticated identity, canonical document hash, version, server acceptance time and method atomically with creation. Existing identities receive no invented evidence. `/auth/legal` exposes the current document and accepts only its version, never a client user ID or time. Business HTTP routes and sockets require evidence. The apps collect existing-user consent before mounting authenticated business screens. Public app Terms content currently matches the server document. Any text change must use a new version; never edit a version in place.

## Session revocation and cutover

Access tokens identify a server session family. Customer refresh rotates within that family. Logout using even an older rotated refresh token revokes every row in the same device family under the family-root lock, preventing concurrent refresh from escaping logout. Another device family stays active. Driver logout uses authenticated `/auth/session/logout`; expired trusted-session continuation also checks that the server family remains active. Ordinary HTTP calls still require an unexpired access token.

HTTP requests and socket events recheck activity. Idle sockets are checked every 30 seconds, so passive subscription removal has a bounded polling delay. An offline device can clear local credentials immediately but cannot guarantee remote revocation until the server receives logout. Driver logout attempts revocation with a five-second bound. This is device-family logout, not an all-devices revocation UI.

Existing customer refresh credentials can rotate into a family; legacy driver access tokens without a family must verify their phone again. Coordinate this cutover with client rollout. Do not remove family-root rows while descendants remain refreshable. Account deletion revokes/removes that account's sessions.

## Chat operations

Current clients persist a sender-account-scoped outbox before transmitting, retain attachment copies outside picker cache, and reuse an operation ID on uncertain HTTP/socket results and restart. The server scopes its unique key to room, sender and operation. Same-ID changed content is a conflict; a new ID permits an intentional identical message. Replayed successes suppress repeat broadcasts/notifications. All replays still require current room authorization. Local journal recovery covers the replacement gap. Notification delivery itself is not a transactional durable outbox and remains an operational concern.

Old clients lacking operation IDs must update. Keep nullable historical operation columns; never infer historical IDs from message text.

## Location ordering

Driver events carry the native fix's `measuredAt`; receipt is stored separately. Bounds are 120 seconds old and 10 seconds ahead of the server. Invalid clocks/stale fixes are rejected with recovery guidance. A request row lock serializes acceptance; fixes at or before the latest measurement are ignored without location broadcast or near-delivery work. Legacy locations use their old `recordedAt` as the comparison baseline. The customer socket subscription rejects out-of-order/duplicate measurements; request status also merges HTTP snapshots by measurement time. New timestamps are required: coordinate driver update with server rollout.

## Retention and files

Customer request deletion archives eligible unassigned requests and rechecks eligibility under the booking lock. Active/unreconciled holds block archival. Holds, settlements, additional charges and earnings restrict physical parent deletion; provider IDs and ledger references survive customer hiding. This does not define a complete statutory retention policy or grant general hard-deletion rights.

`/uploads/*` is authenticated, metadata-authorized and confined to the real uploads root, including legacy URLs. Unrecognized files are unavailable. Request photos may be visible to currently eligible quoting drivers under existing matching rules; proof/invoice and official files require ownership/assignment/admin access. Personal driver identity documents remain owner/admin only. Profile/vehicle marketing images follow existing funded-booking disclosure rules. No public static upload route remains.

Supported images are fully decoded/reencoded with metadata stripped and size/pixel/dimension/page limits. PDFs parse in a bounded worker, reject active/embedded content and excessive pages/dimensions, and retain original PDF bytes. This is structural validation, not an antivirus guarantee. Reencoding changes image bytes. Coordinate admin/mobile protected-image handling and migrate old outside-root file references where necessary; do not reopen a static route.

## OCR and operations

Extraction coalesces same-user, identical-input concurrent requests and caches successful results in memory for 60 seconds (64 entries). It wipes upload buffers and isolates owners. Errors are not cached. This does not provide distributed or restart-persistent provider billing idempotency. Rate limits remain in force, including cache hits. Paid-provider results, distributed quotas, production alert delivery, real backup RPO/RTO, object storage restore and coordinated worker/mobile/API rollback require acceptance evidence.

Five additive migrations were exercised on a fresh disposable PostgreSQL database. A local 77-migration dump/restore rehearsal preserved a synthetic amount. Neither result verifies production volumes, backup credentials, migration duration or production rollback. Never destructively roll back acceptance evidence or financial history to match an older binary.
