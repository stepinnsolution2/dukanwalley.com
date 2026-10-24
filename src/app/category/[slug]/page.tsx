import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { categoryAndDescendantIds, storefrontProductWhere } from "@/lib/catalog";
import { getCurrentMarket } from "@/lib/market-session";
import { listingMetadata, ProductListing, type SP } from "../../products/product-listing";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

/** Categories from before the October 2026 restructure, mapped to their closest new page. */
const MOVED: Record<string, string> = {
  garments: "womens-fashion",
  "garments-women": "womens-fashion",
  "garments-men": "mens-fashion",
  "garments-kids": "kids-baby",
  bags: "bags-accessories",
  "bags-womens-handbags": "bags-accessories-handbags",
  beauty: "beauty-personal-care",
  "beauty-makeup": "beauty-personal-care-makeup",
  jewellery: "jewellery-watches",
  "jewellery-earrings": "jewellery-watches-earrings",
  "jewellery-necklaces-sets": "jewellery-watches-necklaces-sets",
  "jewellery-rings": "jewellery-watches-rings",
  laptop: "laptops-computers",
  "laptop-business": "laptops-computers-business",
  "laptop-everyday": "laptops-computers-everyday",
  "laptop-gaming": "laptops-computers-gaming",
  "laptop-accessories": "computer-accessories",
  "laptop-accessories-bags-sleeves": "computer-accessories-bags-sleeves",
  "laptop-accessories-chargers-adapters": "computer-accessories-chargers-adapters",
  "laptop-accessories-mice-keyboards": "computer-accessories-mice-keyboards",
  "laptop-accessories-storage": "computer-accessories-storage",
  "mobile-phone": "mobiles-tablets",
  "mobile-phone-feature-phones": "mobiles-tablets-feature-phones",
  "mobile-phone-smartphones": "mobiles-tablets-smartphones",
};

const getCategory = cache((slug: string) =>
  prisma.category.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, description: true, imageUrl: true, parent: { select: { name: true } } },
  }),
);

/** Whether anything is listed in this category (or below it) for the shopper's market. */
async function hasProducts(categoryId: string) {
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const count = await prisma.product.count({
    where: { ...storefrontProductWhere(await getCurrentMarket()), categoryId: { in: categoryAndDescendantIds(categoryId, all) } },
  });
  return count > 0;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const category = await getCategory(decodeURIComponent((await params).slug));
  if (!category) return {};
  return listingMetadata(await searchParams, {
    ...category,
    parentName: category.parent?.name,
    empty: !(await hasProducts(category.id)),
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const slug = decodeURIComponent((await params).slug);
  if (!(await getCategory(slug))) {
    const moved = MOVED[slug];
    if (moved) permanentRedirect(`/category/${moved}`);
    notFound();
  }
  // The path decides the category, even if a stray ?category= is also present.
  return <ProductListing sp={{ ...(await searchParams), category: slug }} />;
}
