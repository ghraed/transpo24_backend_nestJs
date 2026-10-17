ALTER TABLE "transport_requests" ADD COLUMN "scheduledDeliveryAt" TIMESTAMP(3);
ALTER TABLE "transport_requests" ADD COLUMN "scheduleTimeZone" TEXT;
