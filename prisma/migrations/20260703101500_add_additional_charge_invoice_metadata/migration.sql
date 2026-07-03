ALTER TABLE "additional_charges"
ADD COLUMN "invoiceOriginalFilename" TEXT,
ADD COLUMN "invoiceMimeType" TEXT,
ADD COLUMN "invoiceSizeBytes" INTEGER;
