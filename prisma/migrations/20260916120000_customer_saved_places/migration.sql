CREATE TABLE "SavedPlace" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "address" VARCHAR(1000) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "placeId" VARCHAR(500),
    "locationKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SavedPlace_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SavedPlace_coordinates_check" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX "SavedPlace_customerId_locationKey_key" ON "SavedPlace"("customerId", "locationKey");
CREATE INDEX "SavedPlace_customerId_updatedAt_idx" ON "SavedPlace"("customerId", "updatedAt");
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
