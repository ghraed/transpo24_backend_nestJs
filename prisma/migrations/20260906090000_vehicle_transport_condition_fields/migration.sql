ALTER TABLE "transport_requests"
  ADD COLUMN "clientDraftId" TEXT,
  ADD COLUMN "vehicleMobility" TEXT,
  ADD COLUMN "vehicleIssues" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "vehicleTransmission" TEXT;

CREATE UNIQUE INDEX "transport_requests_customerId_clientDraftId_key" ON "transport_requests"("customerId", "clientDraftId");
