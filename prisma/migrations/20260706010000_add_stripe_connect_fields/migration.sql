-- Add Stripe Connect fields to driver_profiles
ALTER TABLE "driver_profiles" ADD COLUMN "stripeAccountId" TEXT;
ALTER TABLE "driver_profiles" ADD COLUMN "stripeAccountStatus" TEXT;
ALTER TABLE "driver_profiles" ADD COLUMN "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "driver_profiles" ADD COLUMN "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Create unique index on stripeAccountId
CREATE UNIQUE INDEX "driver_profiles_stripeAccountId_key" ON "driver_profiles"("stripeAccountId");

-- Add Stripe transfer fields to driver_earnings
ALTER TABLE "driver_earnings" ADD COLUMN "stripeTransferId" TEXT;
ALTER TABLE "driver_earnings" ADD COLUMN "stripeTransferStatus" TEXT;