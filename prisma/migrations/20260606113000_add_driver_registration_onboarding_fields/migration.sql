-- AlterTable
ALTER TABLE "driver_profiles"
ADD COLUMN "coverageAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "fullNameOnId" TEXT,
ADD COLUMN "idOrResidencyNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "driver_profiles_idOrResidencyNumber_key"
ON "driver_profiles"("idOrResidencyNumber");
