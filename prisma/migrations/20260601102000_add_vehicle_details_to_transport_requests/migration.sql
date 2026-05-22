ALTER TABLE "transport_requests"
  ADD COLUMN "vehicleVin" TEXT,
  ADD COLUMN "vehicleBrand" TEXT,
  ADD COLUMN "vehicleModel" TEXT,
  ADD COLUMN "vehicleSeries" TEXT,
  ADD COLUMN "vehicleVariant" TEXT,
  ADD COLUMN "vehicleManufactureYear" INTEGER,
  ADD COLUMN "vehicleEstimatedWeightKg" DOUBLE PRECISION,
  ADD COLUMN "vehicleBodyType" TEXT,
  ADD COLUMN "vehicleDataSource" TEXT;
