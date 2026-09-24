-- CreateEnum
CREATE TYPE "CoverageApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "driver_operational_countries" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "canPickup" BOOLEAN NOT NULL DEFAULT true,
    "canDropoff" BOOLEAN NOT NULL DEFAULT true,
    "status" "CoverageApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_operational_countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_route_permissions" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "fromCountryCode" TEXT NOT NULL,
    "toCountryCode" TEXT NOT NULL,
    "status" "CoverageApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_route_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_operational_countries_countryCode_status_canPickup_idx" ON "driver_operational_countries"("countryCode", "status", "canPickup");

-- CreateIndex
CREATE UNIQUE INDEX "driver_operational_countries_driverId_countryCode_key" ON "driver_operational_countries"("driverId", "countryCode");

-- CreateIndex
CREATE INDEX "driver_route_permissions_fromCountryCode_toCountryCode_stat_idx" ON "driver_route_permissions"("fromCountryCode", "toCountryCode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "driver_route_permissions_driverId_fromCountryCode_toCountry_key" ON "driver_route_permissions"("driverId", "fromCountryCode", "toCountryCode");

-- AddForeignKey
ALTER TABLE "driver_operational_countries" ADD CONSTRAINT "driver_operational_countries_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_route_permissions" ADD CONSTRAINT "driver_route_permissions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

