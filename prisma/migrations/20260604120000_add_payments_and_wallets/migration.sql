-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CREDIT_CARD', 'DEBIT_CARD', 'APPLE_PAY', 'GOOGLE_PAY', 'APP_WALLET');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAYMENT_HOLD_PENDING', 'PAYMENT_HELD', 'PAYMENT_FAILED', 'DELIVERY_CONFIRMED', 'PAYMENT_CAPTURE_PENDING', 'PAYMENT_CAPTURED', 'PAYMENT_RELEASED', 'PAYMENT_CANCELLED', 'PAYMENT_REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentTransactionType" AS ENUM ('HOLD', 'CAPTURE', 'RELEASE', 'ADDITIONAL_CHARGE', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'APP_WALLET');

-- CreateEnum
CREATE TYPE "AdditionalChargeStatus" AS ENUM ('PENDING', 'CAPTURED', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "transport_requests"
ADD COLUMN "paymentStatus" "PaymentStatus",
ADD COLUMN "paymentMethod" "PaymentMethod",
ADD COLUMN "heldAmount" DECIMAL(12,2),
ADD COLUMN "capturedAmount" DECIMAL(12,2),
ADD COLUMN "paymentHoldId" TEXT,
ADD COLUMN "stripePaymentIntentId" TEXT;

-- CreateTable
CREATE TABLE "customer_wallets" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reservedBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_holds" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "acceptedOfferId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "stripePaymentMethodId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeClientSecret" TEXT,
    "stripeChargeId" TEXT,
    "metadata" JSONB,
    "capturedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentHoldId" TEXT,
    "additionalChargeId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "type" "PaymentTransactionType" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "additional_charges" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "equipmentType" TEXT,
    "invoiceUrl" TEXT NOT NULL,
    "invoiceStorageKey" TEXT,
    "status" "AdditionalChargeStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "additional_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "transport_requests_paymentHoldId_key" ON "transport_requests"("paymentHoldId");

-- CreateIndex
CREATE UNIQUE INDEX "transport_requests_stripePaymentIntentId_key" ON "transport_requests"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "transport_requests_paymentStatus_idx" ON "transport_requests"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "customer_wallets_customerId_key" ON "customer_wallets"("customerId");

-- CreateIndex
CREATE INDEX "customer_wallets_customerId_currency_idx" ON "customer_wallets"("customerId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "payment_holds_requestId_key" ON "payment_holds"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_holds_acceptedOfferId_key" ON "payment_holds"("acceptedOfferId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_holds_stripePaymentIntentId_key" ON "payment_holds"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "payment_holds_customerId_status_idx" ON "payment_holds"("customerId", "status");

-- CreateIndex
CREATE INDEX "payment_holds_driverId_status_idx" ON "payment_holds"("driverId", "status");

-- CreateIndex
CREATE INDEX "payment_holds_stripePaymentIntentId_idx" ON "payment_holds"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "customer_wallet_transactions_walletId_createdAt_idx" ON "customer_wallet_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_wallet_transactions_customerId_type_idx" ON "customer_wallet_transactions"("customerId", "type");

-- CreateIndex
CREATE INDEX "customer_wallet_transactions_paymentHoldId_idx" ON "customer_wallet_transactions"("paymentHoldId");

-- CreateIndex
CREATE INDEX "customer_wallet_transactions_additionalChargeId_idx" ON "customer_wallet_transactions"("additionalChargeId");

-- CreateIndex
CREATE INDEX "additional_charges_requestId_status_idx" ON "additional_charges"("requestId", "status");

-- CreateIndex
CREATE INDEX "additional_charges_driverId_status_idx" ON "additional_charges"("driverId", "status");

-- CreateIndex
CREATE INDEX "additional_charges_customerId_status_idx" ON "additional_charges"("customerId", "status");

-- AddForeignKey
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_paymentHoldId_fkey" FOREIGN KEY ("paymentHoldId") REFERENCES "payment_holds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallets" ADD CONSTRAINT "customer_wallets_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_holds" ADD CONSTRAINT "payment_holds_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_holds" ADD CONSTRAINT "payment_holds_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "transport_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_holds" ADD CONSTRAINT "payment_holds_acceptedOfferId_fkey" FOREIGN KEY ("acceptedOfferId") REFERENCES "driver_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_holds" ADD CONSTRAINT "payment_holds_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallet_transactions" ADD CONSTRAINT "customer_wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "customer_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallet_transactions" ADD CONSTRAINT "customer_wallet_transactions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallet_transactions" ADD CONSTRAINT "customer_wallet_transactions_paymentHoldId_fkey" FOREIGN KEY ("paymentHoldId") REFERENCES "payment_holds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "transport_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "additional_charges" ADD CONSTRAINT "additional_charges_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_wallet_transactions" ADD CONSTRAINT "customer_wallet_transactions_additionalChargeId_fkey" FOREIGN KEY ("additionalChargeId") REFERENCES "additional_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
