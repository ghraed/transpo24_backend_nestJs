ALTER TABLE "driver_profiles"
ADD COLUMN "countryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "driver_profiles"
SET "countryCodes" = ARRAY["countryCode"]
WHERE "countryCode" IS NOT NULL
  AND COALESCE(array_length("countryCodes", 1), 0) = 0;
