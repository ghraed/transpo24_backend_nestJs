# Tenant foundation rollout — M1

This is an additive foundation, not the completed multi-tenancy rollout.
Do not enable additional live markets until candidate authorization and the
remaining roadmap milestones are implemented and verified.

## Migration and compatibility

New migration: `20260924140000_add_tenant_foundation`.
It creates `tenants`, adds nullable `User.tenantId` and
`refresh_sessions.tenantId`, relations, unique tenant code/country constraints,
active-market lookup and user-tenant indexes. Existing rows are not guessed,
reassigned, deleted, or rewritten. Applied migrations were not edited.

Nullable ownership is deliberate during the backward-compatible expansion.
M13 must verify all customer/driver identities are explicitly assigned before
adding the final ownership constraint (while preserving global ADMIN semantics).
A user's existing profile country and a driver's GPS/coverage do not assign or
transfer home tenant. Profile DTOs reject raw tenant ownership writes.

Settings:

| Setting | Default | Behavior |
| --- | --- | --- |
| `TENANT_AUTH_REQUIRED` | unset / `false` | Missing market remains accepted for old clients; supplied markets always validate. `true` requires market on new login/registration and assigned ownership for customer/driver sessions. |
| `LEGACY_REGISTRATION_MARKET_CODE` | unset | Optional explicitly approved market for **new** legacy registrations only. Never assigns an existing account. Without it, old registrations stay unassigned until explicit backfill. Strict mode ignores this fallback and requires market selection. |
| `ACCESS_TOKEN_FORMAT` | unset / `legacy` | Two-part token issuance stays compatible with released customer builds. `jwt` issues HS256 JWTs containing `sub`, `role`, `tenantId`, `tenantCode`, and existing claims. Both signed formats are verified by the server. |

Do not enable JWT issuance before customer token-expiry decoding supports both
formats (M10/M13). Do not enable tenant auth enforcement before compatible
market-aware apps are live and ownership backfill is complete. Legacy sessions
without a tenant claim hydrate from the current account in the database; bound
claims must match. Inactive tenants are denied on HTTP authentication, refresh,
trusted driver continuation and new socket connections. Revalidation of already
connected socket events/notification recipients remains part of M8/M12.

The existing global ADMIN role can log in without selecting a market. No new
roles or tenant-admin privileges have been introduced.

## Explicit backfill

1. Back up the production database through the normal deployment process.
2. Apply the additive migration before deploying the new API/Prisma client.
3. Prepare a reviewed JSON file with explicit tenant configuration and user IDs:

```json
{
  "tenants": [
    {
      "code": "FR",
      "countryCode": "FR",
      "name": "France",
      "defaultCurrency": "EUR",
      "timezone": "Europe/Paris",
      "defaultLocale": "fr-FR",
      "isActive": true
    }
  ],
  "assignments": [
    { "userId": "reviewed-existing-user-id", "marketCode": "FR" }
  ]
}
```

The example is illustrative, not a production market-activation decision.
Never generate this mapping from phone prefix, GPS, profile country or first
coverage country. Keep user mappings out of source control.

4. With the intended `DATABASE_URL`, run the dry run and review the counts:

```sh
npm run tenants:backfill -- /secure/path/reviewed-plan.json
npm run tenants:backfill -- /secure/path/reviewed-plan.json --apply
```

Dry run writes nothing. `remainingUnassigned` is the current count (not a projected
count in dry-run mode), excluding deleted users and global admins. Apply uses a
serializable transaction and conditional updates. Unknown users, inactive/unknown
markets, conflicting existing tenant config, duplicate assignments, and transfers
between tenants fail. A failure rolls back the complete batch. Identical plans
are idempotent. Existing refresh sessions remain valid and bind to the explicit
account tenant on their next rotation. Use reviewed batches for large populations.

5. Verify zero unassigned live customer/driver identities before enforcement,
   monitor new legacy registrations, deploy compatible apps, then enable the
   rollout settings at M13/M14. No production operation was performed in M1.

Development/test fixtures (FR, CH, LB) are explicitly guarded:

```sh
NODE_ENV=development npm run tenants:seed:dev
```

They reuse the backfill engine, are idempotent and do not assign existing users.
Fixture currencies are for development scenarios; production tenant currency
configuration must be reviewed against current pricing and settlement rules.

## API contract

- New public `GET /tenants/public`: active markets ordered by code; safe fields
  `id`, `code`, `countryCode`, `name`, `defaultCurrency`, `timezone`, `defaultLocale`.
- Optional `marketCode` added to `/auth/register`, `/auth/driver/register`,
  `/auth/login`, `/auth/driver/login`, both customer/driver phone send-code and
  verify-code endpoints, and `/auth/driver/session/continue`.
- Existing auth user responses add `tenantId` and safe `tenant` data.
- `/auth/refresh` preserves its input contract and revalidates/binds tenant.
- Stable errors: `TENANT_NOT_FOUND`, `TENANT_INACTIVE`, `TENANT_MISMATCH`,
  `MARKET_REQUIRED`, `TENANT_ASSIGNMENT_REQUIRED`.
- Invalid credentials are rejected before disclosing account-market mismatch.
  OTP identity verification is required before comparing an existing account.
- Raw `tenantId` fields are rejected by auth/profile HTTP DTOs. Query parameters
  do not override body-selected market or server-resolved authenticated ownership.

## Testing the foundation

Use an isolated PostgreSQL database, never the production connection:

```sh
DATABASE_URL=postgresql://.../tenant_test npx prisma migrate deploy
TENANT_TEST_DATABASE_URL=postgresql://.../tenant_test npm run test:tenants:integration
```

The integration runner refuses non-local hosts and database names not ending in
`_test`; it uses its explicit test URL rather than the application's DATABASE_URL.
It validates real registration/login/refresh, backfill dry-run/idempotence/rollback,
profile-country separation, global admin compatibility and database constraints.
Run `npm run test:cov -- --runInBand`, `npm run test:e2e`, `npm run build`, and
`npm run prisma:validate` for API verification.
