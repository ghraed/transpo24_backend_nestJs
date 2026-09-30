ALTER TABLE "driver_operational_countries" ADD COLUMN IF NOT EXISTS "isAutoHomeGrant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "driver_route_permissions" ADD COLUMN IF NOT EXISTS "isAutoHomeGrant" BOOLEAN NOT NULL DEFAULT false;

-- Existing approved drivers receive domestic coverage only when no admin decision exists.
INSERT INTO "driver_operational_countries" ("id", "driverId", "countryCode", "canPickup", "canDropoff", "status", "isAutoHomeGrant", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, d."id", t."countryCode", true, true, 'APPROVED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "driver_profiles" d
JOIN "User" u ON u."id" = d."userId"
JOIN "tenants" t ON t."id" = u."tenantId"
WHERE d."status" = 'APPROVED' AND u."deletedAt" IS NULL AND u."role" = 'DRIVER'
ON CONFLICT ("driverId", "countryCode") DO UPDATE
SET "status" = 'APPROVED', "canPickup" = true, "canDropoff" = true,
    "isAutoHomeGrant" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "driver_operational_countries"."status" = 'PENDING'
  AND "driver_operational_countries"."reviewedByAdminId" IS NULL;

INSERT INTO "driver_route_permissions" ("id", "driverId", "fromCountryCode", "toCountryCode", "status", "isAutoHomeGrant", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, d."id", t."countryCode", t."countryCode", 'APPROVED', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "driver_profiles" d
JOIN "User" u ON u."id" = d."userId"
JOIN "tenants" t ON t."id" = u."tenantId"
WHERE d."status" = 'APPROVED' AND u."deletedAt" IS NULL AND u."role" = 'DRIVER'
ON CONFLICT ("driverId", "fromCountryCode", "toCountryCode") DO UPDATE
SET "status" = 'APPROVED', "isAutoHomeGrant" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "driver_route_permissions"."status" = 'PENDING'
  AND "driver_route_permissions"."reviewedByAdminId" IS NULL;
