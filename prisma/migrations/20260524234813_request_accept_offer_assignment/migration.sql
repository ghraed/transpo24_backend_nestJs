-- AlterTable
ALTER TABLE "transport_requests"
ADD COLUMN "acceptedOfferId" TEXT,
ADD COLUMN "assignedDriverId" TEXT,
ADD COLUMN "acceptedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "transport_requests_acceptedOfferId_key" ON "transport_requests"("acceptedOfferId");

-- CreateIndex
CREATE INDEX "transport_requests_assignedDriverId_status_idx" ON "transport_requests"("assignedDriverId", "status");

-- AddForeignKey
ALTER TABLE "transport_requests"
ADD CONSTRAINT "transport_requests_acceptedOfferId_fkey"
FOREIGN KEY ("acceptedOfferId") REFERENCES "driver_offers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_requests"
ADD CONSTRAINT "transport_requests_assignedDriverId_fkey"
FOREIGN KEY ("assignedDriverId") REFERENCES "driver_profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
