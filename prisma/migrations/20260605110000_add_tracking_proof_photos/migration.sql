-- CreateEnum
CREATE TYPE "TransportProofPhotoType" AS ENUM ('PICKUP', 'DELIVERY');

-- AlterTable
ALTER TABLE "transport_requests"
ADD COLUMN "nearDeliveryNotifiedAt" TIMESTAMP(3),
ADD COLUMN "ratingAvailableAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "transport_request_proof_photos" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "type" "TransportProofPhotoType" NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_request_proof_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transport_request_proof_photos_requestId_type_sortOrder_key" ON "transport_request_proof_photos"("requestId", "type", "sortOrder");

-- CreateIndex
CREATE INDEX "transport_request_proof_photos_requestId_type_idx" ON "transport_request_proof_photos"("requestId", "type");

-- AddForeignKey
ALTER TABLE "transport_request_proof_photos" ADD CONSTRAINT "transport_request_proof_photos_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "transport_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
