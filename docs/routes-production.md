# Production driver routing

Verified 2026-10-25. The API is accessed over SSH at `88.99.63.223` as root using
an existing local SSH identity. The application runs as `transpo24-api` through
`transpo24-api.service` in `/opt/transpo24-api`.

`GOOGLE_ROUTES_API_KEY` is stored only in the production API environment file,
`/opt/transpo24-api/.env`. Its original owner and restricted file permissions were
preserved. It is not an Expo environment variable and must never be bundled into
mobile apps, committed, or logged.

Google Routes successfully returned three driving alternatives with polylines
from the deployed service. Production IPv4 egress is `88.99.63.223`; the earlier
address `213.204.71.102` was not the server's IPv4 egress. Google rejected IPv6
`2a01:4f8:10a:1029::2` even after the restriction update. The Routes HTTPS transport
therefore explicitly uses IPv4 for this provider only, retaining default TLS
certificate and hostname validation. Keep the server key restricted to Routes
API and the server's static outbound IP in Google Cloud.

## Endpoint

`POST /driver/routes/compute` requires a valid driver bearer token. It validates
nested coordinates, optional place IDs, language and alternatives; rejects
unknown fields; and limits callers to 30 requests per minute per driver through
the existing shared Redis/memory counter service. The upstream request has an
8-second timeout and a 1 MiB response limit. Provider errors and credentials are
not returned to clients. Route coordinates are not cached or logged here.

The response exposes route summaries, encoded polylines, distance and duration
in the shape already used by the driver app. Both pickup/delivery polylines and
on-my-way route alternatives now call the backend. Via routes preserve the
existing combination of alternatives for both legs.

## Deployment and validation

Only the new Routes module and its AppModule registration were deployed. The
build was compiled against a staged copy of the actual production source, whose
base commit was `a178e3b54f504e4ecbb1d38a94148eb8f53a54dc`; unrelated local API changes
were not deployed. No dependencies or database schemas changed.

- API build and lint passed; 14 route service/transport/HTTP tests passed.
- Driver typecheck, lint and all 54 suites / 312 tests passed.
- Production readiness returned HTTP 200 after the restart.
- The public route endpoint returned HTTP 401 without authentication.
- The running service loaded the server credential, and the deployed Routes
  service returned `OK` with three valid route alternatives.
- Final rollback copy: `/opt/transpo24-api/.codex-backups/routes-ipv4-1792955066`.
  It contains the prior dist and Routes source. Earlier complete registration
  backup: `/opt/transpo24-api/.codex-backups/routes-1792954828`.

Physical iPhone testing and App Store/TestFlight steps remain required. Do not
publish a mobile build that expects this endpoint until its backend is deployed.
The integration does not migrate unrelated Places/Geocoding API calls.
