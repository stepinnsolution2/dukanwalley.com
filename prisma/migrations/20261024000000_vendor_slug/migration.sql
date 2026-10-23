-- Public store URLs (/store/<slug>). Backfill existing stores from their names; repeats get -2, -3…
ALTER TABLE "VendorProfile" ADD COLUMN "slug" TEXT;

WITH base AS (
  SELECT "id", "createdAt",
         COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("storeName"), '[^a-z0-9]+', '-', 'g')), ''), 'store') AS s
  FROM "VendorProfile"
), numbered AS (
  SELECT "id", s, ROW_NUMBER() OVER (PARTITION BY s ORDER BY "createdAt", "id") AS n FROM base
)
UPDATE "VendorProfile" v
SET "slug" = CASE WHEN numbered.n = 1 THEN numbered.s ELSE numbered.s || '-' || numbered.n END
FROM numbered
WHERE v."id" = numbered."id";

CREATE UNIQUE INDEX "VendorProfile_slug_key" ON "VendorProfile"("slug");
