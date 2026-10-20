-- Product variants (e.g. size x colour with stock each) and colour-tagged images.
ALTER TABLE "CategoryAttribute" ADD COLUMN "isVariant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProductImage" ADD COLUMN "color" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "variantId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "variantLabel" TEXT;

CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "optionsKey" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "stock" INTEGER NOT NULL DEFAULT 0,
    "sku" TEXT,
    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductVariant_productId_optionsKey_key" ON "ProductVariant"("productId", "optionsKey");
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CartItem" ADD COLUMN "variantId" TEXT;
ALTER TABLE "CartItem" ADD COLUMN "variantKey" TEXT NOT NULL DEFAULT '';
DROP INDEX "CartItem_cartId_productId_key";
CREATE UNIQUE INDEX "CartItem_cartId_productId_variantKey_key" ON "CartItem"("cartId", "productId", "variantKey");
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sizes and colours are what shoppers pick for clothes and shoes.
UPDATE "CategoryAttribute" SET "isVariant" = true WHERE "key" IN ('size', 'color', 'colour');
