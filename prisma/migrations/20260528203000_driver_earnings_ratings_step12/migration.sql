-- CreateEnum
CREATE TYPE "DriverEarningStatus" AS ENUM ('PENDING', 'AVAILABLE', 'PAID_OUT', 'CANCELLED');

-- AlterTable
ALTER TABLE "driver_profiles"
ADD COLUMN "averageRating" DECIMAL(3,2),
ADD COLUMN "ratingsCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "transport_requests"
ADD COLUMN "finalPrice" DECIMAL(12,2),
ADD COLUMN "currency" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "driver_earnings" (
  "id" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "grossAmount" DECIMAL(12,2) NOT NULL,
  "platformFeeAmount" DECIMAL(12,2) NOT NULL,
  "netAmount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "DriverEarningStatus" NOT NULL DEFAULT 'AVAILABLE',
  "availableAt" TIMESTAMP(3),
  "paidOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driver_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_ratings" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "driverId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driver_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_earnings_tripId_key" ON "driver_earnings"("tripId");
CREATE INDEX "driver_earnings_driverId_status_idx" ON "driver_earnings"("driverId", "status");
CREATE INDEX "driver_earnings_createdAt_idx" ON "driver_earnings"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "driver_ratings_tripId_key" ON "driver_ratings"("tripId");
CREATE INDEX "driver_ratings_driverId_rating_idx" ON "driver_ratings"("driverId", "rating");
CREATE INDEX "driver_ratings_customerId_idx" ON "driver_ratings"("customerId");

-- AddForeignKey
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_tripId_fkey"
FOREIGN KEY ("tripId") REFERENCES "transport_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_tripId_fkey"
FOREIGN KEY ("tripId") REFERENCES "transport_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_driverId_fkey"
FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driver_ratings" ADD CONSTRAINT "driver_ratings_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
