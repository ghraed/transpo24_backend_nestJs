ALTER TABLE "driver_profiles"
ADD COLUMN "preferredLanguages" "PreferredLanguage"[] NOT NULL DEFAULT ARRAY[]::"PreferredLanguage"[];

UPDATE "driver_profiles"
SET "preferredLanguages" = ARRAY["preferredLanguage"]
WHERE "preferredLanguage" IS NOT NULL;

ALTER TABLE "driver_profiles"
DROP COLUMN "preferredLanguage";
