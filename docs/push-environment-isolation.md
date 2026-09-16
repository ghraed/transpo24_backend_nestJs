# Mobile push environment isolation

Set `PUSH_ENVIRONMENT=DEVELOPMENT` on the local API and `PUSH_ENVIRONMENT=PRODUCTION` on production. Missing or invalid values block mobile push. Keep each deployment on its own database; never point a development server at the production database.

Both customer and driver apps register their native application ID. Development IDs end in `.dev` on Android and iOS. The apps first verify `/push-tokens/environment`; an old or mismatched API receives no device token. The API rejects mismatched registrations and filters both ordinary and test sends by environment and application ID. Classified tokens cannot be moved to a different environment by registration. Application IDs are client metadata, not device attestation.

The additive migration deliberately leaves old tokens unclassified. These tokens are excluded until the updated app registers again; do not bulk-label copied or legacy tokens. No token is deleted. iOS development builds need rebuilding for their separate bundle identifiers.

## Production rollout

The local changes do not deploy production. Deploy the additive migration, configure PRODUCTION, and release the updated API and customer/driver apps together. Existing versions without applicationId cannot register with the updated API, and old unclassified tokens cannot receive pushes until an updated app opens and registers. Plan this transition explicitly; strict isolation cannot safely classify legacy opaque tokens automatically. Test development-to-production and production-to-development rejection before rollout. The shared Firebase project/FCM key can remain unchanged; this change does not rotate or remove production credentials.
