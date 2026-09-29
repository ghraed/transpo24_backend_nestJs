ALTER TYPE "PreferredLanguage" ADD VALUE IF NOT EXISTS 'es';
ALTER TABLE "driver_profiles" ADD COLUMN "reviewVehicleId" TEXT;
