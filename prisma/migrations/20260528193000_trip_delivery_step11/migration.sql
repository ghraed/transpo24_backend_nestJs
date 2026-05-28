-- AlterTable
ALTER TABLE "transport_requests"
ADD COLUMN "driverGoingToDropoffAt" TIMESTAMP(3),
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "deliveryConfirmedByDriver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deliveryNotes" TEXT,
ADD COLUMN "deliveryProofImageUrl" TEXT;
