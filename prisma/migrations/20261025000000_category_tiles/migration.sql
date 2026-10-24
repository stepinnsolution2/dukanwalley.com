-- Home page "Shop by category" tiles: an image per category, and which categories are featured.
ALTER TABLE "Category" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Category" ADD COLUMN "showOnHome" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Category" ADD COLUMN "homeOrder" INTEGER NOT NULL DEFAULT 0;

-- Start with every main category featured, in the shop's category order.
UPDATE "Category" c SET "showOnHome" = true, "homeOrder" = o.n * 10
FROM (VALUES
  ('womens-fashion', 1), ('mens-fashion', 2), ('kids-baby', 3), ('shoes', 4), ('bags-accessories', 5),
  ('jewellery-watches', 6), ('beauty-personal-care', 7), ('mobiles-tablets', 8), ('mobile-accessories', 9),
  ('laptops-computers', 10), ('computer-accessories', 11), ('electronics', 12), ('home-kitchen', 13),
  ('sports-fitness', 14)
) AS o(slug, n)
WHERE c."slug" = o.slug AND c."parentId" IS NULL;
