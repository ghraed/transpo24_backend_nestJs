CREATE TABLE "route_blocks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fromCountryCode" VARCHAR(2) NOT NULL,
  "toCountryCode" VARCHAR(2) NOT NULL,
  "transportType" "ServiceKey",
  "reason" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByAdminId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "route_blocks_countries_check" CHECK (
    "fromCountryCode" ~ '^[A-Z]{2}$' AND "toCountryCode" ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT "route_blocks_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "route_blocks_fromCountryCode_toCountryCode_isActive_idx" ON "route_blocks"("fromCountryCode", "toCountryCode", "isActive");
-- Separate indexes make NULL/all-type duplicates impossible, including concurrent writes.
CREATE UNIQUE INDEX "route_blocks_active_all_types_key" ON "route_blocks"("fromCountryCode", "toCountryCode") WHERE "isActive" AND "transportType" IS NULL;
CREATE UNIQUE INDEX "route_blocks_active_type_key" ON "route_blocks"("fromCountryCode", "toCountryCode", "transportType") WHERE "isActive" AND "transportType" IS NOT NULL;
