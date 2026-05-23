-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'DRIVER');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('PENDING_PROFILE', 'PENDING_DOCUMENTS', 'PENDING_REVIEW', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER';

-- CreateTable
CREATE TABLE "driver_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "countryCode" TEXT,
    "city" TEXT,
    "status" "DriverStatus" NOT NULL DEFAULT 'PENDING_PROFILE',
    "isProfileCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_userId_key" ON "driver_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_phone_key" ON "driver_profiles"("phone");

-- CreateIndex
CREATE INDEX "driver_profiles_status_idx" ON "driver_profiles"("status");

-- AddForeignKey
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
