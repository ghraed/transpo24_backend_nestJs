-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "driver_availabilities" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "serviceRadiusKm" INTEGER NOT NULL,
    "baseLatitude" DOUBLE PRECISION,
    "baseLongitude" DOUBLE PRECISION,
    "baseAddress" TEXT,
    "acceptsImmediateRequests" BOOLEAN NOT NULL DEFAULT true,
    "acceptsScheduledRequests" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_availability_schedules" (
    "id" TEXT NOT NULL,
    "availabilityId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_availability_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_availabilities_driverId_key" ON "driver_availabilities"("driverId");

-- CreateIndex
CREATE INDEX "driver_availabilities_isOnline_idx" ON "driver_availabilities"("isOnline");

-- CreateIndex
CREATE UNIQUE INDEX "driver_availability_schedules_availabilityId_dayOfWeek_key" ON "driver_availability_schedules"("availabilityId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "driver_availability_schedules_availabilityId_idx" ON "driver_availability_schedules"("availabilityId");

-- AddForeignKey
ALTER TABLE "driver_availabilities" ADD CONSTRAINT "driver_availabilities_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_availability_schedules" ADD CONSTRAINT "driver_availability_schedules_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "driver_availabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
