-- CreateEnum
CREATE TYPE "DriverRequestAlertStatus" AS ENUM ('NEW', 'SEEN', 'ACCEPTED', 'IGNORED', 'EXPIRED');

-- CreateTable
CREATE TABLE "driver_request_alerts" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" "DriverRequestAlertStatus" NOT NULL DEFAULT 'NEW',
    "seenAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "ignoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_request_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_request_alerts_requestId_driverId_key" ON "driver_request_alerts"("requestId", "driverId");

-- CreateIndex
CREATE INDEX "driver_request_alerts_driverId_status_idx" ON "driver_request_alerts"("driverId", "status");

-- CreateIndex
CREATE INDEX "driver_request_alerts_requestId_idx" ON "driver_request_alerts"("requestId");

-- AddForeignKey
ALTER TABLE "driver_request_alerts" ADD CONSTRAINT "driver_request_alerts_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "transport_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_request_alerts" ADD CONSTRAINT "driver_request_alerts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
