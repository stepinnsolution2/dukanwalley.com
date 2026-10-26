-- Supplier sizes up to 6XL for clothing (kept before "Free Size" / "Unstitched"), and a shade /
-- colour choice for beauty products (lipstick shades). Only adds what is missing.
UPDATE "CategoryAttribute" a
SET "options" = (
  SELECT array_agg(o ORDER BY ord) FROM (
    SELECT o, CASE WHEN o IN ('Free Size', 'Unstitched') THEN 1000 + i ELSE i END AS ord
    FROM unnest(a."options") WITH ORDINALITY AS t(o, i)
    UNION ALL
    SELECT x, 500 + j FROM unnest(ARRAY['XXXL', '4XL', '5XL', '6XL']) WITH ORDINALITY AS u(x, j)
    WHERE NOT x = ANY(a."options")
  ) z
)
FROM "Category" c
WHERE a."categoryId" = c."id" AND c."slug" IN ('womens-fashion', 'mens-fashion')
  AND a."key" = 'size' AND a."dataType" = 'select';

INSERT INTO "CategoryAttribute" ("id", "categoryId", "name", "key", "dataType", "required", "options", "isVariant")
SELECT 'beauty-shade-' || c."id", c."id", 'Shade / colour', 'color', 'text', false, '{}', true
FROM "Category" c
WHERE c."slug" = 'beauty-personal-care'
  AND NOT EXISTS (SELECT 1 FROM "CategoryAttribute" a WHERE a."categoryId" = c."id" AND a."key" = 'color');
