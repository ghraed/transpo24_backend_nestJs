ALTER TYPE "ChatMessageType" ADD VALUE 'FILE';
ALTER TABLE "transport_requests" ADD COLUMN "vehicleDocumentPromptOfferId" TEXT;
CREATE TABLE "request_files" (
 "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "uploadedById" TEXT NOT NULL,
 "category" TEXT NOT NULL, "documentType" TEXT, "fileName" TEXT NOT NULL,
 "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL, "data" BYTEA NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "request_files_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "request_files_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "transport_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "request_files_category_check" CHECK ("category" IN ('OFFICIAL', 'CHAT')),
 CONSTRAINT "request_files_type_check" CHECK (("category" = 'CHAT' AND "documentType" IS NULL) OR ("category" = 'OFFICIAL' AND "documentType" IS NOT NULL AND "documentType" IN ('PICKUP_AUTHORIZATION','INSURANCE','PURCHASE_PROOF','OTHER'))),
 CONSTRAINT "request_files_size_check" CHECK ("size" > 0 AND "size" <= 10485760 AND octet_length("data") = "size")
);
CREATE INDEX "request_files_requestId_category_idx" ON "request_files"("requestId", "category");
