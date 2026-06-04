ALTER TABLE "transport_requests"
ADD COLUMN "furnitureDescription" TEXT,
ADD COLUMN "furnitureApproximateItemCount" INTEGER,
ADD COLUMN "furnitureNeedsHelpers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "furnitureCustomerCanHelpLoading" BOOLEAN NOT NULL DEFAULT false;
