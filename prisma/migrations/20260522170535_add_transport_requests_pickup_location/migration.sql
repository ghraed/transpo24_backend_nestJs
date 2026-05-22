-- CreateEnum
CREATE TYPE "TransportRequestStatus" AS ENUM ('DRAFT', 'PENDING_QUOTES', 'QUOTED', 'ACCEPTED', 'DRIVER_ASSIGNED', 'PICKUP_IN_PROGRESS', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "transport_requests" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "status" "TransportRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "pickupLatitude" DOUBLE PRECISION,
    "pickupLongitude" DOUBLE PRECISION,
    "pickupAddress" TEXT,
    "pickupPlaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transport_requests_customerId_idx" ON "transport_requests"("customerId");

-- CreateIndex
CREATE INDEX "transport_requests_serviceId_idx" ON "transport_requests"("serviceId");

-- AddForeignKey
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
