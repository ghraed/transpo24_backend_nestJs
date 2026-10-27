# Profile and driver Places release — 2026-10-27

## Production profile deployment

The reported iPhone has driver 1.0.2 (6) installed. Its profile error rejected
`driverType` and `trn` and required a retired profile field. Production was still
using the old validation contract. The targeted profile/Places backend is now
deployed and ready (HTTP 200). Both personal and company profile DTOs accept
full names and business details without the retired field.

Applied migrations:

- `20261019120000_driver_business_type`
- `20261027120000_remove_retired_profile_fields`

The obsolete columns have been removed from production and local development.
The protected local database dump is
`/tmp/transpo24-local-profile-before-removal-1793098182875.dump`. Applied migration
history is preserved. A protected full database dump, prior runtime/source,
environment file and retired-field snapshot are stored only on the server:
`/opt/transpo24-api/.codex-backups/profile-places-1793096859558`.

The deployment was built from the actual production source (base
`a178e3b54f504e4ecbb1d38a94148eb8f53a54dc` plus its deployed Routes module).
Only profile identity, business fields and Places changes were added. Local
booking, payment, commission and matching changes were not included. Its
staging directory is `/opt/transpo24-api/.codex-staging/profile-places-20261027`.

Read-only production checks passed: profile DTO validation, expected database
columns, and HTTP 401 for all anonymous Places endpoints through both the local
listener and public HTTPS proxy. No driver sessions were minted and no existing
user profiles were submitted or changed for verification.

## One shared backend key per environment

Reuse the existing Google Cloud credentials:

- **Local:** `Transpo24 Routes - Local Development`.
- **Production:** `Transpo24 Backend Routes`.

For both keys, allow **Routes API**, **Places API (New)** and **Geocoding API**.
Retain **Places API (Legacy)** during the transition if it is already permitted;
Google detected recent legacy usage on the production key.
Retain their respective outbound-IP restrictions. The observed local IPv4 is
`194.246.89.133`; production IPv4 is `88.99.63.223`. The local public address can
change when the development network changes. Google explicitly rejected the
local key for originating IP 194.246.89.133 until that allowlist is corrected.

`GOOGLE_MAPS_SERVER_API_KEY` is the single shared environment variable for all
three backend services. Each environment reuses its existing Routes credential;
no new credential is needed. Shared-key service/config rollback files are in
`/opt/transpo24-api/.codex-backups/shared-maps-key-1793097868`. `GOOGLE_ROUTES_API_KEY` remains a compatible fallback,
and Places also supports the older `GOOGLE_PLACES_API_KEY` override. These names
do not require separate API keys. Never use an `EXPO_PUBLIC_` prefix for a server
credential or include it in an app update.

Native iOS and Android map SDK credentials keep their application restrictions.
They remain separate from the IP-restricted backend key. Firebase-created keys
are not part of this consolidation and have not been changed.

## Driver place lookup

Live diagnostics confirmed that the iOS map-display key is not authorized for
Places web-service requests. The Android key returns autocomplete predictions
and place details; its Geocoding request is separately denied. The replacement
uses authenticated backend endpoints, independent of the mobile platform:

- `POST /driver/places/autocomplete`: `{ input, languageCode? }`
- `POST /driver/places/details`: `{ placeId, languageCode? }`
- `POST /driver/places/reverse`: `{ latitude, longitude, languageCode? }`

The backend uses Places API (New) for autocomplete/details and Geocoding API for
reverse lookup, filtering responses into the existing mobile format. Requests
require a driver token, validate input and permit 120 calls per driver per
minute. Upstream requests have an 8-second timeout and 1 MiB response limit,
use IPv4 with normal TLS, and do not expose credentials/provider errors.

During backend rollout/outages, Android retains its previous working provider
for HTTP 404/502/503 responses. It includes the production package/signing
identity and a 10-second timeout. Authentication, validation and rate-limit
errors never trigger fallback. The unauthorized iOS SDK key is never used as a
Places fallback. GPS/native reverse lookup and exact-coordinate map selection
retain their existing fallback behavior.

For physical iPhone development, explicitly configured localhost/127.0.0.1 API
URLs use the Expo Metro computer's private LAN IPv4 when available. Simulators,
Android USB, explicit remote URLs, tunnel hosts and production builds retain
their configuration. This avoids sending a local API request to the iPhone's
own localhost. The API must still be reachable from the phone's Wi-Fi network.

## Mobile delivery and remaining verification

- Driver Android: published group `ff5c0397-214e-4c0b-82f4-3bf015225bad`, runtime
  `6f743d78c7ae2d570b0d207ba04dd76a305c88fe`. This matches the installed Android
  1.0.2 (20) package and local release AAB.
- Customer Android: published name-contract group
  `94e9196d-c33c-4301-9be7-ad2bc793b6c3`, runtime `1.0.2`.
- Customer iOS: published name-contract group
  `b0745f9e-bea4-4a78-b735-c816df9db6fa`, runtime `1.0.2`.
- Customer updates were staged from the existing iOS build 3 source with profile
  and chat-name changes only; unrelated date-picker changes were excluded.
- Driver iOS: published group `64defc59-b715-45f7-ac86-ecea1070b2e7`, runtime
  `711a53f0a51de53bbe1ffa826d19817683fa20d8`, matching TestFlight build 6.

Older mobile releases reading retired response properties may show generic
Customer/Driver labels until updated. Older customer builds sending the retired
field need the published update before saving profiles against this API.

The owner enabled Places API (New), saved the API allowlists and corrected the
local IP restriction. After Google restriction propagation, the final complete
live sequence passed in both environments: autocomplete returned five
predictions, selected-place details returned valid coordinates, reverse lookup
returned an address, and Routes returned a route. Both API readiness endpoints
returned HTTP 200. The shared key remains server-only in each environment.

Final automated verification: API 77 suites / 934 tests; driver 61 suites / 387
tests. The staged customer release passed its 17 focused profile/chat/API tests,
TypeScript and targeted lint; the working customer source previously passed all
71 suites / 527 tests. API build/lint, driver TypeScript/lint, migration/schema
checks and whitespace checks passed. Active app/API source and the Prisma schema
contain no retired identity-field references; historical migrations remain.

Phone acceptance check: close/reopen each production app, allow the update to
download, then tap Restart now when offered. TestFlight retains version 1.0.2
(6); the JavaScript fix arrives through its matching production-ios channel.
Repeat profile completion and OMW search/selection, map/current-location use and
route finding on Android and iPhone. Actual physical iPhone interaction was not
available to the agent; backend checks and native-runtime compatibility were
verified without impersonating a user.

References: [Google API key restrictions](https://developers.google.com/maps/api-security-best-practices#restrict-your-api-keys),
[authenticated proxy guidance](https://developers.google.com/maps/api-security-best-practices#use-a-proxy-server),
[Autocomplete (New)](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete),
[Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details),
[reverse geocoding](https://developers.google.com/maps/documentation/geocoding/requests-reverse-geocoding).
