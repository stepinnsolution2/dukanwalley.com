import { permanentRedirect } from "next/navigation";
import { listingHref, listingMetadata, one, ProductListing, type SP } from "./product-listing";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<SP> };

export async function generateMetadata({ searchParams }: Props) {
  return listingMetadata(await searchParams);
}

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams;
  // Old /products?category=x links (and bookmarks) move to the category's own page.
  if (one(sp.category)) permanentRedirect(listingHref(sp));
  return <ProductListing sp={sp} />;
}
