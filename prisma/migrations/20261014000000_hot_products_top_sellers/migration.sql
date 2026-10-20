-- "Hot" products and "Top seller" vendors, both highlighted on the home page.
ALTER TABLE "Product" ADD COLUMN "isHot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VendorProfile" ADD COLUMN "isTopSeller" BOOLEAN NOT NULL DEFAULT false;
