-- AlterEnum
ALTER TYPE "TransportRequestStatus" ADD VALUE 'ITEM_PICKED_UP';

-- AlterTable
ALTER TABLE "transport_requests"
ADD COLUMN "itemPickedUpAt" TIMESTAMP(3),
ADD COLUMN "pickupConfirmedByDriver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pickupNotes" TEXT,
ADD COLUMN "pickupProofImageUrl" TEXT;
