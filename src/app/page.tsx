import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/ad-slot";
import { CategoryTiles } from "@/components/category-tiles";
import { HomeHero } from "@/components/home-hero";
import { JsonLd } from "@/components/json-ld";
import { ProductTile } from "@/components/product-tile";
import { SellerAvatar } from "@/components/seller-avatar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { sellableVendorWhere, storefrontProductWhere } from "@/lib/catalog";
import { getCurrentMarket } from "@/lib/market-session";
import { PAGE_WIDE } from "@/lib/page-layout";
import { absoluteUrl, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/seo";
import { storeHref } from "@/lib/vendor-slug";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: `${SITE_NAME} – ${SITE_TAGLINE}` },
  description: `Shop products from multiple verified sellers on ${SITE_NAME}. Browse categories, compare prices and order online in Pakistan and the UAE.`,
  alternates: { canonical: "/" },
};

const siteJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/logo.png"),
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/products?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  },
];

const grid = "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8";

export default async function HomePage() {
  const market = await getCurrentMarket();
  const live = storefrontProductWhere(market);
  const image = { images: { orderBy: { sortOrder: "asc" }, take: 1 } } as const;
  const [hot, products, topSellers] = await Promise.all([
    prisma.product.findMany({
      where: { ...live, isHot: true },
      include: image,
      orderBy: [{ featuredPriority: "desc" }, { updatedAt: "desc" }],
      take: 16,
    }),
    prisma.product.findMany({
      where: live,
      include: image,
      orderBy: [{ featuredPriority: "desc" }, { updatedAt: "desc" }],
      take: 32,
    }),
    prisma.vendorProfile.findMany({
      where: { ...sellableVendorWhere, market, isTopSeller: true, products: { some: live } },
      select: { id: true, slug: true, storeName: true, logoUrl: true },
      orderBy: { storeName: "asc" },
      take: 16,
    }),
  ]);

  return (
    <>
      <JsonLd data={siteJsonLd} />
      <SiteHeader />
      <main className={`${PAGE_WIDE} flex flex-col gap-5`}>
        <HomeHero />

        <CategoryTiles />

        {hot.length ? (
          <section>
            <SectionHeading title="🔥 Hot products" href="/products" linkLabel="View all" />
            <div className={grid}>
              {hot.map((p) => (
                <ProductTile key={p.id} product={p} market={market} />
              ))}
            </div>
          </section>
        ) : null}

        {topSellers.length ? (
          <section>
            <SectionHeading title="Top sellers" href="/sellers" linkLabel="All sellers" />
            <ul className="flex gap-3 overflow-x-auto pb-1">
              {topSellers.map((s) => (
                <li key={s.id} className="w-24 shrink-0">
                  <Link href={storeHref(s)} className="flex flex-col items-center gap-1.5 text-center hover:text-teal-700">
                    <SellerAvatar name={s.storeName} logoUrl={s.logoUrl} size={80} />
                    <span className="line-clamp-2 text-xs font-medium">{s.storeName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <SectionHeading title="Featured" href="/products" linkLabel="View all" />
          <div className={grid}>
            {products.map((p) => (
              <ProductTile key={p.id} product={p} market={market} />
            ))}
          </div>
          {products.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-600">
              No live products yet. Seed the database and approve listings from the admin panel.
            </p>
          ) : null}
        </section>
        <AdSlot placement="home_bottom" />
      </main>
      <SiteFooter />
    </>
  );
}

function SectionHeading({ title, href, linkLabel }: { title: string; href: string; linkLabel: string }) {
  return (
    <div className="mb-2 flex items-end justify-between gap-2">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      <Link href={href} className="text-sm font-medium text-teal-700 hover:underline">
        {linkLabel}
      </Link>
    </div>
  );
}
