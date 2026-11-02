# Trip confirmation ranges

Arrival at pickup, confirming item pickup, and confirming delivery all use the
same straight-line GPS distance limit. The boundary is inclusive.

- Local driver app (the backend target that displays the Local header): 2,000 m.
- Driver app connected to the production API: 100 m, including development builds.
- Missing or invalid app configuration defaults to 100 m.

The driver app shares its environment classifier between the Local banner and
`src/config/trip-confirmation.ts`. Its three GPS validation helpers and visible
distance hints use that shared radius.

The backend makes its own decision: 2,000 m only when `ENABLE_TEST_ENDPOINTS=true`
and `NODE_ENV` is not `production`. This flag is already enabled in the local
backend environment. Every other backend uses 100 m. Production always enforces
100 m even when test endpoints were accidentally enabled; a client header,
request field, or development build cannot enable the wider production radius.

Both pickup and delivery HTTP confirmations require valid latitude and longitude.
Missing GPS coordinates are rejected by both the DTO and service checks. Pickup
no longer omits coordinates when GPS is out of range. The app blocks the action
and tells the driver to move closer. Stored pickup/dropoff coordinates must also
be present to check the radius.

Tests cover production and local selection, the same classifier as the banner,
all three confirmation actions, inclusive backend boundaries, just-outside
coordinates, invalid/missing GPS and production's override of test mode.
