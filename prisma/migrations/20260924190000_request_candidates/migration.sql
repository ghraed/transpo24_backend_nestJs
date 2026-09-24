-- Existing alerts are history, not automatically approved candidates.
ALTER TABLE "driver_request_alerts" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "matchedAt" TIMESTAMP(3);
CREATE INDEX "driver_request_alerts_driverId_isActive_idx" ON "driver_request_alerts"("driverId", "isActive");
CREATE INDEX "driver_request_alerts_requestId_isActive_idx" ON "driver_request_alerts"("requestId", "isActive");
CREATE INDEX "transport_requests_matching_route_idx" ON "transport_requests"("pickupCountryCode", "destinationCountryCode", "status", "id");
