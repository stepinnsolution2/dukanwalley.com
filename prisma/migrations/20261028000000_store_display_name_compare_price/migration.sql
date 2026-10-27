-- AlterTable
ALTER TABLE "Product" ADD COLUMN "compareAtPrice" DECIMAL(12,2),
ADD COLUMN "showStockCount" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "VendorProfile" ADD COLUMN "displayName" TEXT;

-- AlterTable
ALTER TABLE "ImportJob" ADD COLUMN "showStockCount" BOOLEAN NOT NULL DEFAULT true;
