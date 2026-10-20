-- Sell in Pakistan (PKR) and the UAE (AED).
CREATE TYPE "Market" AS ENUM ('PK', 'AE');

-- Vendors: free-text country becomes a market. Anything not already AE (e.g. the old "US" default) maps to PK.
ALTER TABLE "VendorProfile" ADD COLUMN "market" "Market" NOT NULL DEFAULT 'PK';
UPDATE "VendorProfile" SET "market" = 'AE' WHERE upper("country") IN ('AE', 'UAE');
ALTER TABLE "VendorProfile" DROP COLUMN "country";

ALTER TABLE "VendorProfile" ADD COLUMN "nationalId" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN "businessRegNo" TEXT;
ALTER TABLE "VendorProfile" ADD COLUMN "taxRegNo" TEXT;

-- Orders: existing rows take their vendor's market; new rows must always set it.
ALTER TABLE "Order" ADD COLUMN "market" "Market" NOT NULL DEFAULT 'PK';
UPDATE "Order" o SET "market" = v."market"
  FROM "OrderItem" oi JOIN "VendorProfile" v ON v."id" = oi."vendorId"
  WHERE oi."orderId" = o."id";
ALTER TABLE "Order" ALTER COLUMN "market" DROP DEFAULT;

-- Ledger currency is always written explicitly from the order's market.
ALTER TABLE "LedgerMovement" ALTER COLUMN "currency" DROP DEFAULT;
