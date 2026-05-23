-- CreateEnum
CREATE TYPE "PreferredLanguage" AS ENUM ('en', 'ar', 'de', 'fr', 'it');

-- AlterTable
ALTER TABLE "driver_profiles" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "preferredLanguage" "PreferredLanguage",
ADD COLUMN     "profilePhotoUrl" TEXT;
