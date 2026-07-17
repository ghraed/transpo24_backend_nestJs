-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_REFUND_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_PARTIALLY_REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PAYMENT_DISPUTED';

-- CreateEnum
CREATE TYPE "TripPaymentSettlementStatus" AS ENUM (
    'COLLECTED',
    'REFUND_PENDING',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
    'DISPUTED',
    'MANUAL_REVIEW'
);

-- CreateEnum
CREATE TYPE "DriverPayoutState" AS ENUM (
    'NOT_EARNED',
    'EARNING_CREATED',
    'PENDING_TRANSFER',
    'PAID_OUT',
    'TRANSFER_FAILED',
    'NOT_APPLICABLE'
);

-- CreateTable
CREATE TABLE "trip_payment_settlements" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "paymentHoldId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "driverId" TEXT,
    "currency" TEXT NOT NULL,
    "collectedAmount" DECIMAL(12,2) NOT NULL,
    "refundableAmount" DECIMAL(12,2) NOT NULL,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "retainedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "driverShareAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "platformShareAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "TripPaymentSettlementStatus" NOT NULL DEFAULT 'COLLECTED',
    "driverPayoutState" "DriverPayoutState" NOT NULL DEFAULT 'NOT_EARNED',
    "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
    "lastStripeRefundId" TEXT,
    "disputeReportedAt" TIMESTAMP(3),
    "payoutFailureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_payment_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_payment_settlements_requestId_key" ON "trip_payment_settlements"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "trip_payment_settlements_paymentHoldId_key" ON "trip_payment_settlements"("paymentHoldId");

-- CreateIndex
CREATE INDEX "trip_payment_settlements_customerId_status_idx" ON "trip_payment_settlements"("customerId", "status");

-- CreateIndex
CREATE INDEX "trip_payment_settlements_driverId_driverPayoutState_idx" ON "trip_payment_settlements"("driverId", "driverPayoutState");

-- CreateIndex
CREATE INDEX "trip_payment_settlements_status_driverPayoutState_idx" ON "trip_payment_settlements"("status", "driverPayoutState");

-- AddForeignKey
ALTER TABLE "trip_payment_settlements" ADD CONSTRAINT "trip_payment_settlements_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "transport_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_payment_settlements" ADD CONSTRAINT "trip_payment_settlements_paymentHoldId_fkey" FOREIGN KEY ("paymentHoldId") REFERENCES "payment_holds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_payment_settlements" ADD CONSTRAINT "trip_payment_settlements_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_payment_settlements" ADD CONSTRAINT "trip_payment_settlements_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
