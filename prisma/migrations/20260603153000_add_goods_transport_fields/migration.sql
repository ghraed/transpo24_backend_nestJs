CREATE TYPE "GoodsShipmentSize" AS ENUM (
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL'
);

CREATE TYPE "GoodsHeavyShipmentType" AS ENUM (
  'ONE_HEAVY_ITEM',
  'MULTIPLE_SMALLER_PIECES'
);

ALTER TABLE "transport_requests"
ADD COLUMN "goodsShipmentSize" "GoodsShipmentSize",
ADD COLUMN "goodsDescription" TEXT,
ADD COLUMN "goodsApproximateWeightKg" DOUBLE PRECISION,
ADD COLUMN "goodsNumberOfPieces" INTEGER,
ADD COLUMN "goodsIsFragile" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "goodsRequiresRefrigeration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "goodsHeavyShipmentType" "GoodsHeavyShipmentType";
