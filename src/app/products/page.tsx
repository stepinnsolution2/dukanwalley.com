import { permanentRedirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isFilteredListing, listingHref, listingMetadata, one, ProductListing, type SP } from "./product-listing";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<SP> };

export async function generateMetadata({ searchParams }: Props) {
  return listingMetadata(await searchParams);
}

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams;
  // Old /products?category=x links (and bookmarks) move to the category's own page.
  if (one(sp.category)) permanentRedirect(listingHref(sp));
  // A plain seller link becomes the store page; with extra filters it stays a filtered listing.
  const sellerId = one(sp.seller);
  if (sellerId && !isFilteredListing(sp, ["seller"])) {
    const store = await prisma.vendorProfile.findUnique({ where: { id: sellerId }, select: { slug: true } });
    if (store?.slug) {
      const page = one(sp.page);
      permanentRedirect(`/store/${store.slug}${page && page !== "1" ? `?page=${encodeURIComponent(page)}` : ""}`);
    }
  }
  return <ProductListing sp={sp} />;
}
