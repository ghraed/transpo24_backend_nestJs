-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('VEHICLE', 'MOTORCYCLE', 'GOODS', 'FURNITURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('WORKING', 'NOT_WORKING', 'NEW', 'USED', 'FRAGILE', 'UNKNOWN');

-- AlterTable
ALTER TABLE "transport_requests" ADD COLUMN     "isImmediate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "itemBrand" TEXT,
ADD COLUMN     "itemCondition" "ItemCondition",
ADD COLUMN     "itemDescription" TEXT,
ADD COLUMN     "itemHeightCm" DOUBLE PRECISION,
ADD COLUMN     "itemLengthCm" DOUBLE PRECISION,
ADD COLUMN     "itemModel" TEXT,
ADD COLUMN     "itemTitle" TEXT,
ADD COLUMN     "itemType" "ItemType",
ADD COLUMN     "itemWeightKg" DOUBLE PRECISION,
ADD COLUMN     "itemWidthCm" DOUBLE PRECISION,
ADD COLUMN     "itemYear" INTEGER,
ADD COLUMN     "loadingWorkersCount" INTEGER,
ADD COLUMN     "requiresLoadingHelp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledPickupAt" TIMESTAMP(3),
ADD COLUMN     "specialInstructions" TEXT;
