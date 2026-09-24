-- Additive rollout: historical geography and ownership require reviewed backfill.
-- Existing currency values are deliberately untouched.
ALTER TABLE "transport_requests"
  ADD COLUMN "customerTenantId" TEXT,
  ADD COLUMN "originTenantId" TEXT,
  ADD COLUMN "pickupCountryCode" VARCHAR(2),
  ADD COLUMN "destinationCountryCode" VARCHAR(2);
CREATE INDEX "transport_requests_customerTenantId_idx" ON "transport_requests"("customerTenantId");
CREATE INDEX "transport_requests_originTenantId_idx" ON "transport_requests"("originTenantId");
CREATE INDEX "transport_requests_pickupCountryCode_destinationCountryCode_idx" ON "transport_requests"("pickupCountryCode", "destinationCountryCode");
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_customerTenantId_fkey" FOREIGN KEY ("customerTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transport_requests" ADD CONSTRAINT "transport_requests_originTenantId_fkey" FOREIGN KEY ("originTenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
