ALTER TABLE "driver_profiles"
  ADD COLUMN "driverType" VARCHAR(8) NOT NULL DEFAULT 'PERSONAL',
  ADD COLUMN "trn" VARCHAR(100);
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_business_type_check"
  CHECK (("driverType" = 'PERSONAL' AND "trn" IS NULL) OR
         ("driverType" = 'COMPANY' AND "trn" IS NOT NULL AND LENGTH(BTRIM("trn")) > 0));
