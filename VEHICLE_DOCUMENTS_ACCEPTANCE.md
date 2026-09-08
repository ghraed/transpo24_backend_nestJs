# Point 13 — vehicle documents

Implemented across `client_mobile/app`, `driver_mobile`, `backend/api`, and `admin/Transpo_24`.

## Customer flow

After an offer is selected and payment is successfully held, opening the request status page prompts the customer to add documents or choose “No documents for now”. The prompt response is saved for that accepted offer. The customer can add documents later from the document card in request details. Cancelling the picker does not send a file or acknowledge the prompt.

Official types: Abholvollmacht (`PICKUP_AUTHORIZATION`), Versicherungsdokument (`INSURANCE`), Kaufnachweis (`PURCHASE_PROOF`), Sonstiges Dokument (`OTHER`). PDF, JPG/JPEG and PNG are supported, up to 10 MB per file. All six mobile languages have labels and error messages.

## Driver, chat and admin

The selected driver sees official documents in accepted job details. Both participants can send additional files from the active chat. File messages use existing realtime delivery and chat notifications; filenames are not translated. Chat files remain separate from the official document list.

Admin: Delivery Operations → Open details → Private vehicle documents → View documents. Official and chat files are shown separately with authenticated downloads.

## Privacy and storage

Files are stored in PostgreSQL bytea, never in the public `/uploads` folder. Metadata and every download require authentication and verify request ownership, the currently selected driver, or ADMIN role. Reassigned drivers lose download access. Only the request customer can upload official documents after a successful payment hold; chat uploads also enforce active room membership, blocks, and the current assignment. File bytes and declared types are checked on the server. Responses disable caching, and mobile downloads are removed from the app cache after opening the system viewer/share sheet. Request deletion cascades to stored files.

## Validation (2026-09-08)

- Customer: TypeScript, changed-file lint, 69 tests, Android debug build, Android JavaScript export.
- Driver: TypeScript, changed-file lint, 14 tests, Android JavaScript export and Android ARM64 debug build (BUILD SUCCESSFUL).
- Backend: Nest build, full TypeScript check, changed-file lint, 179 tests. Corrected stale test fixtures for supported Italian and two test-only TypeScript annotations found during the broader checks.
- Local Prisma migration applied; schema validates and migration status is current.
- Real PostgreSQL + Nest HTTP integration test verifies all four types, PDF/JPG/PNG byte round trips, payment gating, owner/driver/admin authorization, unauthenticated and unrelated-user denial, invalid/oversized files, both chat directions, realtime and notification hooks, official/chat separation, revoked driver access and cascading deletion. All synthetic fixtures are rolled back; external notifications are mocked.
- Admin: production build, TypeScript, component lint, 12 existing tests. Actual Chrome page exercised with synthetic API fixtures: labels, separation, authenticated PDF download with matching bytes/filename, failed-load retry, no runtime exceptions.

Repeat the database/HTTP check from `backend/api`: `npm run test:documents:integration`. It requires a migrated local PostgreSQL database and refuses remote database hosts.

## Release

Deploy the backend migration with `npx prisma migrate deploy`, regenerate Prisma and deploy the API before releasing the interfaces. The migration was applied locally only; no production deployment was performed. Both mobile apps need a new native binary for the new Expo file modules; an OTA JavaScript update alone cannot add those modules. Native document picking/opening on physical Android/iOS devices remains a manual release check; automated component, API, browser, bundling and build checks do not replace that device check.
