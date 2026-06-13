-- CreateEnum
CREATE TYPE "VehicleCargoType" AS ENUM ('VEHICLE', 'MOTORCYCLE', 'GOODS', 'FURNITURE', 'FRAGILE_GOODS', 'REFRIGERATED_GOODS', 'HEAVY_EQUIPMENT', 'OTHER');

-- AlterTable
ALTER TABLE "driver_vehicles" ADD COLUMN     "allowedCargoTypes" "VehicleCargoType"[] DEFAULT ARRAY[]::"VehicleCargoType"[],
ADD COLUMN     "dimensionsAreStandard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDefaultLoadProfile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loadProfileName" TEXT,
ADD COLUMN     "workingSchedule" JSONB;

-- CreateIndex
CREATE INDEX "driver_vehicles_driverId_isDefaultLoadProfile_idx" ON "driver_vehicles"("driverId", "isDefaultLoadProfile");
