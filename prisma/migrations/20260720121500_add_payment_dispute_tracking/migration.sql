ALTER TYPE "CustomerWalletTopUpStatus"
ADD VALUE IF NOT EXISTS 'DISPUTED';

ALTER TYPE "CustomerWalletTopUpStatus"
ADD VALUE IF NOT EXISTS 'MANUAL_REVIEW';

ALTER TABLE "trip_payment_settlements"
ADD COLUMN "stripeDisputeId" TEXT,
ADD COLUMN "disputeStatus" TEXT,
ADD COLUMN "disputeReason" TEXT,
ADD COLUMN "disputeAmount" DECIMAL(12,2),
ADD COLUMN "disputeCurrency" TEXT,
ADD COLUMN "disputeCreatedAt" TIMESTAMP(3),
ADD COLUMN "disputeUpdatedAt" TIMESTAMP(3),
ADD COLUMN "disputeClosedAt" TIMESTAMP(3),
ADD COLUMN "disputeEvidenceDueBy" TIMESTAMP(3);

ALTER TABLE "customer_wallet_top_ups"
ADD COLUMN "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripeDisputeId" TEXT,
ADD COLUMN "disputeStatus" TEXT,
ADD COLUMN "disputeReason" TEXT,
ADD COLUMN "disputeAmount" DECIMAL(12,2),
ADD COLUMN "disputeCurrency" TEXT,
ADD COLUMN "disputeCreatedAt" TIMESTAMP(3),
ADD COLUMN "disputeUpdatedAt" TIMESTAMP(3),
ADD COLUMN "disputeClosedAt" TIMESTAMP(3),
ADD COLUMN "disputeEvidenceDueBy" TIMESTAMP(3);

CREATE INDEX "trip_payment_settlements_stripeDisputeId_idx"
ON "trip_payment_settlements"("stripeDisputeId");

CREATE INDEX "customer_wallet_top_ups_stripeDisputeId_idx"
ON "customer_wallet_top_ups"("stripeDisputeId");
