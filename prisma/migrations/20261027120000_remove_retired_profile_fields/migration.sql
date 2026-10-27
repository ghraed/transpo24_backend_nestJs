-- Full names are the sole identity fields used by the applications.
ALTER TABLE "User" DROP COLUMN "nickname";
ALTER TABLE "driver_profiles" DROP COLUMN "nickname";
