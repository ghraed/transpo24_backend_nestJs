ALTER TABLE "driver_availabilities"
  ADD COLUMN "cityCoverage" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "liveLatitude" DOUBLE PRECISION,
  ADD COLUMN "liveLongitude" DOUBLE PRECISION,
  ADD COLUMN "liveLocationAt" TIMESTAMP(3);
