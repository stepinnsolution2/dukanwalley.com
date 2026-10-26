-- Home page "Most Popular" row, set by admins (like Trending / isHot).
ALTER TABLE "Product" ADD COLUMN "isPopular" BOOLEAN NOT NULL DEFAULT false;
