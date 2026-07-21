CREATE TYPE "PaymentReconciliationStream" AS ENUM (
    'WALLET',
    'CAPTURE',
    'REFUND',
    'TRANSFER'
);

CREATE TYPE "PaymentReconciliationStatus" AS ENUM (
    'MATCHED',
    'MISMATCH',
    'MISSING',
    'FAILED'
);

CREATE TYPE "PaymentReconciliationRunStatus" AS ENUM (
    'SUCCESS',
    'PARTIAL',
    'FAILED',
    'RUNNING'
);

CREATE TABLE "payment_reconciliation_runs" (
    "id" TEXT NOT NULL,
    "stream" "PaymentReconciliationStream" NOT NULL,
    "status" "PaymentReconciliationRunStatus" NOT NULL DEFAULT 'RUNNING',
    "scannedCount" INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "mismatchCount" INTEGER NOT NULL DEFAULT 0,
    "missingCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_reconciliation_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_reconciliation_records" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stream" "PaymentReconciliationStream" NOT NULL,
    "status" "PaymentReconciliationStatus" NOT NULL,
    "currency" TEXT NOT NULL,
    "expectedAmount" DECIMAL(12,2),
    "actualAmount" DECIMAL(12,2),
    "deltaAmount" DECIMAL(12,2),
    "reference" TEXT,
    "externalReference" TEXT,
    "tripId" TEXT,
    "walletTopUpId" TEXT,
    "transferId" TEXT,
    "refundId" TEXT,
    "captureId" TEXT,
    "customerId" TEXT,
    "driverId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "driverName" TEXT,
    "driverEmail" TEXT,
    "reason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_reconciliation_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_reconciliation_runs_stream_createdAt_idx" ON "payment_reconciliation_runs"("stream", "createdAt");
CREATE INDEX "payment_reconciliation_runs_status_createdAt_idx" ON "payment_reconciliation_runs"("status", "createdAt");
CREATE INDEX "payment_reconciliation_records_runId_stream_status_idx" ON "payment_reconciliation_records"("runId", "stream", "status");
CREATE INDEX "payment_reconciliation_records_stream_status_createdAt_idx" ON "payment_reconciliation_records"("stream", "status", "createdAt");
CREATE INDEX "payment_reconciliation_records_tripId_idx" ON "payment_reconciliation_records"("tripId");
CREATE INDEX "payment_reconciliation_records_walletTopUpId_idx" ON "payment_reconciliation_records"("walletTopUpId");

ALTER TABLE "payment_reconciliation_records"
ADD CONSTRAINT "payment_reconciliation_records_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "payment_reconciliation_runs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_reconciliation_records"
ADD CONSTRAINT "payment_reconciliation_records_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
