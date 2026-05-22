CREATE TYPE "VehicleCondition" AS ENUM ('RUNNING', 'NEEDS_JUMP_START', 'NEEDS_WINCH', 'NEEDS_CRANE', 'MISSING_WHEELS');

ALTER TABLE "transport_requests"
  ADD COLUMN "vehicleCondition" "VehicleCondition",
  ADD COLUMN "vehicleConditionNotes" TEXT;
