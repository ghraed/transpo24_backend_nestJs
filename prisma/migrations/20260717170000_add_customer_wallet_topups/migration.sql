-- AlterEnum
ALTER TYPE "PaymentTransactionType" ADD VALUE 'TOP_UP';

-- CreateEnum
CREATE TYPE "CustomerWalletTopUpStatus" AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED'
);

-- AlterTable
ALTER TABLE "customer_wallet_transactions" ADD COLUMN "walletTopUpId" TEXT;

-- CreateTable
CREATE TABLE "customer_wallet_top_ups" (
    "id" TEXT NOT NULL,
    "walletId" TEXT,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "CustomerWalletTopUpStatus" NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeClientSecret" TEXT,
    "stripeChargeId" TEXT,
    "failureReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_wallet_top_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_wallet_top_ups_stripePaymentIntentId_key" ON "customer_wallet_top_ups"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "customer_wallet_top_ups_customerId_status_idx" ON "customer_wallet_top_ups"("customerId", "status");

-- CreateIndex
CREATE INDEX "customer_wallet_top_ups_walletId_createdAt_idx" ON "customer_wallet_top_ups"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_wallet_transactions_walletTopUpId_idx" ON "customer_wallet_transactions"("walletTopUpId");

-- AddForeignKey
ALTER TABLE "customer_wallet_transactions" ADD CONSTRAINT "customer_wallet_transactions_walletTopUpId_fkey" FOREIGN KEY ("walletTopUpId") REFERENCES "customer_wallet_top_ups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallet_top_ups" ADD CONSTRAINT "customer_wallet_top_ups_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "customer_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallet_top_ups" ADD CONSTRAINT "customer_wallet_top_ups_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
