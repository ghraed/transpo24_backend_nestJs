-- CreateTable
CREATE TABLE "transport_request_photos" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_request_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transport_request_photos_requestId_idx" ON "transport_request_photos"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "transport_request_photos_requestId_sortOrder_key" ON "transport_request_photos"("requestId", "sortOrder");

-- AddForeignKey
ALTER TABLE "transport_request_photos" ADD CONSTRAINT "transport_request_photos_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "transport_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
