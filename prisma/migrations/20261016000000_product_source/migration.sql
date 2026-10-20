-- Where an imported product came from (e.g. Markaz), to match it on re-import.
ALTER TABLE "Product" ADD COLUMN "source" TEXT;
ALTER TABLE "Product" ADD COLUMN "sourceRef" TEXT;
CREATE UNIQUE INDEX "Product_source_sourceRef_key" ON "Product"("source", "sourceRef");
