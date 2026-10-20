-- Existing payments retain their original price and have no client commission.
ALTER TABLE "payment_holds"
ADD COLUMN "customerPlatformFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
