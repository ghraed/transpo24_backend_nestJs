CREATE TYPE "MotorcycleType" AS ENUM (
  'SPORT_BIKE',
  'CRUISER',
  'ELECTRIC_MOTORCYCLE',
  'SCOOTER',
  'OTHER'
);

CREATE TYPE "MotorcycleCondition" AS ENUM (
  'WORKING',
  'NOT_WORKING',
  'DAMAGED',
  'UNKNOWN'
);

ALTER TABLE "transport_requests"
ADD COLUMN "motorcycleType" "MotorcycleType",
ADD COLUMN "motorcycleChassisNumber" TEXT,
ADD COLUMN "motorcycleCondition" "MotorcycleCondition",
ADD COLUMN "requiresSpecialWrapping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requiresDedicatedCarrier" BOOLEAN NOT NULL DEFAULT false;
