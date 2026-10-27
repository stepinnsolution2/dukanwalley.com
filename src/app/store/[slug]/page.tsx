import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { JsonLd } from "@/components/json-ld";
import { prisma } from "@/lib/db";
import { sellableVendorWhere } from "@/lib/catalog";
import { breadcrumbJsonLd, SITE_NAME } from "@/lib/seo";
import { publicVendor } from "@/lib/vendor-slug";
import { isFilteredListing, one, ProductListing, type SP } from "../../products/product-listing";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

// Shoppers only ever see the public store name.
const getStore = cache(async (slug: string) => {
  const store = await prisma.vendorProfile.findFirst({
    where: { slug, ...sellableVendorWhere },
    select: { id: true, slug: true, storeName: true, displayName: true, city: true, logoUrl: true },
  });
  return store && publicVendor(store);
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const store = await getStore(decodeURIComponent((await params).slug));
  if (!store) return { title: "Store not found", robots: { index: false } };
  const sp = await searchParams;
  const page = Math.max(1, Math.trunc(Number(one(sp.page))) || 1);
  const filtered = isFilteredListing(sp);
  const path = `/store/${store.slug}`;
  const title = `${store.storeName}${page > 1 ? ` – Page ${page}` : ""}`;
  const description = `Shop products from ${store.storeName}${store.city ? ` (${store.city})` : ""} on ${SITE_NAME}. Browse the store's catalogue and order online.`;
  return {
    title,
    description,
    alternates: { canonical: page > 1 && !filtered ? `${path}?page=${page}` : path },
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      description,
      url: path,
      images: [{ url: store.logoUrl ?? "/logo.png", alt: store.storeName }],
    },
  };
}

export default async function StorePage({ params, searchParams }: Props) {
  const store = await getStore(decodeURIComponent((await params).slug));
  if (!store) notFound();
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Sellers", path: "/sellers" },
          { name: store.storeName, path: `/store/${store.slug}` },
        ])}
      />
      <ProductListing sp={{ ...(await searchParams), seller: store.id }} />
    </>
  );
}
