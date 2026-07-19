ALTER TABLE "trip_payment_settlements"
ADD COLUMN "payoutAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastPayoutAttemptAt" TIMESTAMP(3),
ADD COLUMN "nextPayoutRetryAt" TIMESTAMP(3);

UPDATE "trip_payment_settlements" AS tps
SET
  "driverPayoutState" = CASE
    WHEN de."stripeTransferId" IS NOT NULL OR de.status = 'PAID_OUT' THEN 'PAID_OUT'::"DriverPayoutState"
    WHEN tps."driverPayoutState" = 'NOT_EARNED' AND de.status <> 'PAID_OUT' AND de."stripeTransferId" IS NULL THEN 'EARNING_CREATED'::"DriverPayoutState"
    ELSE tps."driverPayoutState"
  END,
  "payoutFailureReason" = CASE
    WHEN de."stripeTransferId" IS NOT NULL OR de.status = 'PAID_OUT' THEN NULL
    ELSE tps."payoutFailureReason"
  END,
  "nextPayoutRetryAt" = CASE
    WHEN de."stripeTransferId" IS NOT NULL OR de.status = 'PAID_OUT' THEN NULL
    WHEN tps."driverPayoutState" = 'TRANSFER_FAILED' THEN COALESCE(tps."nextPayoutRetryAt", NOW())
    WHEN de."availableAt" IS NOT NULL THEN de."availableAt"
    ELSE NOW()
  END
FROM "driver_earnings" AS de
WHERE de."tripId" = tps."requestId";

UPDATE "trip_payment_settlements"
SET "nextPayoutRetryAt" = NOW()
WHERE
  "driverPayoutState" IN ('EARNING_CREATED', 'PENDING_TRANSFER', 'TRANSFER_FAILED')
  AND "nextPayoutRetryAt" IS NULL;
