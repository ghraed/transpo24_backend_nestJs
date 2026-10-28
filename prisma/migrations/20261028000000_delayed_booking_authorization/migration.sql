ALTER TYPE "TripPaymentSettlementStatus" ADD VALUE IF NOT EXISTS 'RELEASED';
ALTER TYPE "TripPaymentSettlementStatus" ADD VALUE IF NOT EXISTS 'CANCELLED_WITH_FEE';
ALTER TYPE "TripPaymentSettlementStatus" ADD VALUE IF NOT EXISTS 'AUTHORIZED';

ALTER TABLE "payment_holds"
  ADD COLUMN "policyVersion" TEXT,
  ADD COLUMN "confirmationState" TEXT,
  ADD COLUMN "confirmationStartedAt" TIMESTAMP(3),
  ADD COLUMN "authorizationDueAt" TIMESTAMP(3),
  ADD COLUMN "approvalDeadlineAt" TIMESTAMP(3),
  ADD COLUMN "authorizedAt" TIMESTAMP(3),
  ADD COLUMN "authorizationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "authorizationAttempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "previousStripePaymentIntentId" TEXT,
  ADD COLUMN "operationKind" TEXT,
  ADD COLUMN "operationAmount" DECIMAL(12,2);
CREATE INDEX "payment_holds_confirmationState_authorizationDueAt_idx" ON "payment_holds"("confirmationState", "authorizationDueAt");
CREATE INDEX "payment_holds_authorizationExpiresAt_idx" ON "payment_holds"("authorizationExpiresAt");

ALTER TABLE "customer_wallet_top_ups" ADD COLUMN "acceptedPolicyVersion" TEXT;
ALTER TABLE "additional_charges" ADD COLUMN "acceptedPolicyVersion" TEXT;
ALTER TABLE "payment_holds" ADD COLUMN "confirmationNotifiedState" TEXT, ADD COLUMN "driverAcceptanceNotifiedAt" TIMESTAMP(3);
