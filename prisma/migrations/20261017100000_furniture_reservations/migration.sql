ALTER TYPE "TransportRequestStatus" ADD VALUE 'RESERVED';
CREATE TYPE "DeferredFurniturePaymentState" AS ENUM ('WAITING', 'CONFIRMATION_DUE', 'PAYMENT_PENDING', 'PAID', 'EXPIRED', 'CANCELLED');
ALTER TABLE "transport_requests"
  ADD COLUMN "deferredPaymentState" "DeferredFurniturePaymentState",
  ADD COLUMN "confirmationOpensAt" TIMESTAMP(3),
  ADD COLUMN "paymentDeadlineAt" TIMESTAMP(3),
  ADD COLUMN "pickupConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "reservationPaidAt" TIMESTAMP(3),
  ADD COLUMN "reservationSelectedNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "reservationPaymentNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "reservationReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "reservationCancellationNotifiedAt" TIMESTAMP(3),
  ADD COLUMN "reservationRefundedAt" TIMESTAMP(3);
CREATE INDEX "transport_requests_deferredPaymentState_confirmationOpensAt_idx" ON "transport_requests"("deferredPaymentState", "confirmationOpensAt");
CREATE INDEX "transport_requests_deferredPaymentState_paymentDeadlineAt_idx" ON "transport_requests"("deferredPaymentState", "paymentDeadlineAt");
