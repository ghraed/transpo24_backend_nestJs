ALTER TABLE "driver_profiles"
ADD COLUMN "cities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "driver_profiles"
SET "cities" = ARRAY["city"]
WHERE "city" IS NOT NULL
  AND COALESCE(array_length("cities", 1), 0) = 0;
