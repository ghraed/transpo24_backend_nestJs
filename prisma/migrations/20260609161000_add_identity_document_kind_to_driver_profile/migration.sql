CREATE TYPE "IdentityDocumentKind" AS ENUM ('NATIONAL_ID', 'RESIDENCY_CARD');

ALTER TABLE "driver_profiles"
ADD COLUMN "identityDocumentKind" "IdentityDocumentKind";
