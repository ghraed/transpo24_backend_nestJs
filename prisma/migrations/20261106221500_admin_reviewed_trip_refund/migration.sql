ALTER TABLE "trip_payment_settlements"
  ADD COLUMN "refundReviewedByAdminId" TEXT,
  ADD COLUMN "refundReviewReason" TEXT,
  ADD COLUMN "refundRequestedAt" TIMESTAMP(3);
