-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransportRequestStatus" ADD VALUE 'DRIVER_GOING_TO_PICKUP';
ALTER TYPE "TransportRequestStatus" ADD VALUE 'DRIVER_ARRIVED_PICKUP';
ALTER TYPE "TransportRequestStatus" ADD VALUE 'DRIVER_GOING_TO_DROPOFF';
ALTER TYPE "TransportRequestStatus" ADD VALUE 'COMPLETED';

-- AlterTable
ALTER TABLE "transport_requests" ADD COLUMN     "driverArrivedPickupAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "driver_locations" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "requestId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_locations_driverId_recordedAt_idx" ON "driver_locations"("driverId", "recordedAt");

-- CreateIndex
CREATE INDEX "driver_locations_requestId_recordedAt_idx" ON "driver_locations"("requestId", "recordedAt");

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_locations" ADD CONSTRAINT "driver_locations_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "transport_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
