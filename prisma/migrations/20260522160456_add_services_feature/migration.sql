-- CreateEnum
CREATE TYPE "ServiceKey" AS ENUM ('VEHICLE_TRANSPORT', 'MOTORCYCLE_TRANSPORT', 'GOODS_TRANSPORT', 'FURNITURE_TRANSPORT');

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "key" "ServiceKey" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_key_key" ON "Service"("key");
