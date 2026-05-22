-- AlterTable
ALTER TABLE "transport_requests" ADD COLUMN     "dropoffAddress" TEXT,
ADD COLUMN     "dropoffLatitude" DOUBLE PRECISION,
ADD COLUMN     "dropoffLongitude" DOUBLE PRECISION,
ADD COLUMN     "dropoffPlaceId" TEXT;
