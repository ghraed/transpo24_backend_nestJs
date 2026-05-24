-- CreateEnum
CREATE TYPE "DriverOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "driver_offers" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "alertId" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "estimatedPickupAt" TIMESTAMP(3),
    "estimatedDeliveryAt" TIMESTAMP(3),
    "estimatedDurationMinutes" INTEGER,
    "message" TEXT,
    "status" "DriverOfferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_offers_driverId_status_idx" ON "driver_offers"("driverId", "status");

-- CreateIndex
CREATE INDEX "driver_offers_requestId_status_idx" ON "driver_offers"("requestId", "status");

-- CreateIndex
CREATE INDEX "driver_offers_alertId_idx" ON "driver_offers"("alertId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_offers_requestId_driverId_key" ON "driver_offers"("requestId", "driverId");

-- AddForeignKey
ALTER TABLE "driver_offers" ADD CONSTRAINT "driver_offers_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "transport_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_offers" ADD CONSTRAINT "driver_offers_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_offers" ADD CONSTRAINT "driver_offers_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "driver_request_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
