import type { Metadata } from "next";
import Link from "next/link";
import { AdSlot } from "@/components/ad-slot";
import { AutoScroller } from "@/components/auto-scroller";
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
import type { MarketCode } from "@/lib/markets";
import { PAGE_WIDE } from "@/lib/page-layout";
import { absoluteUrl, BUSINESS, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/seo";
import { storeHref } from "@/lib/vendor-slug";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The phrase Pakistani shoppers search for, then the brand.
  title: { absolute: `Online Shopping in Pakistan – ${SITE_NAME}` },
  description: `Online shopping in Pakistan with ${SITE_NAME}: ${SITE_TAGLINE.toLowerCase()}. Shop fashion, shoes, mobiles, electronics and more from verified sellers and compare prices.`,
  alternates: { canonical: "/" },
};

const siteJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/logo.png"),
    legalName: BUSINESS.legalName,
    email: BUSINESS.email,
    telephone: BUSINESS.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: `${BUSINESS.streetAddress}, ${BUSINESS.locality}`,
      addressLocality: BUSINESS.city,
      addressRegion: BUSINESS.region,
      addressCountry: BUSINESS.country,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: BUSINESS.phone,
      email: BUSINESS.email,
      areaServed: "PK",
      availableLanguage: ["en", "ur"],
      hoursAvailable: {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        opens: "00:00",
        closes: "23:59",
      },
    },
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


export default async function HomePage() {
  const market = await getCurrentMarket();
  const live = storefrontProductWhere(market);
  const image = { images: { orderBy: { sortOrder: "asc" }, take: 1 } } as const;
  const rowOrder = [{ featuredPriority: "desc" }, { updatedAt: "desc" }] as const;
  // Trending, Featured (featured priority > 0) and Most Popular are picked by admins (Admin › Products).
  // Until something is featured, that row shows the newest products as "New arrivals".
  const [trending, featured, popular, topSellers] = await Promise.all([
    prisma.product.findMany({ where: { ...live, isHot: true }, include: image, orderBy: [...rowOrder], take: 16 }),
    prisma.product.findMany({ where: { ...live, featuredPriority: { gt: 0 } }, include: image, orderBy: [...rowOrder], take: 24 }),
    prisma.product.findMany({ where: { ...live, isPopular: true }, include: image, orderBy: [...rowOrder], take: 16 }),
    prisma.vendorProfile.findMany({
      where: { ...sellableVendorWhere, market, isTopSeller: true, products: { some: live } },
      select: { id: true, slug: true, storeName: true, logoUrl: true },
      orderBy: { storeName: "asc" },
      take: 16,
    }),
  ]);
  const newest = featured.length
    ? []
    : await prisma.product.findMany({ where: live, include: image, orderBy: { createdAt: "desc" }, take: 24 });
  const middleRow = featured.length ? featured : newest;

  return (
    <>
      <JsonLd data={siteJsonLd} />
      <SiteHeader />
      {/* No top padding: the banner sits right under the header. */}
      <main className={`${PAGE_WIDE} flex flex-col gap-5 !pt-0`}>
        <HomeHero />

        <CategoryTiles />

        <ProductRow title="🔥 Trending" href="/products?collection=trending" products={trending} market={market} />

        {featured.length ? (
          <ProductRow title="★ Featured" href="/products?collection=featured" products={featured} market={market} />
        ) : middleRow.length ? (
          <ProductRow title="New arrivals" href="/products?sort=newest" products={middleRow} market={market} />
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-600">
            New products are on their way. Check back soon!
          </p>
        )}

        <ProductRow title="⭐ Most Popular" href="/products?collection=popular" products={popular} market={market} />

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

        <AdSlot placement="home_bottom" />
      </main>
      <SiteFooter />
    </>
  );
}

/** A one-line row of products that slides slowly right to left; hidden while empty. */
function ProductRow({
  title,
  href,
  products,
  market,
}: {
  title: string;
  href: string;
  products: React.ComponentProps<typeof ProductTile>["product"][];
  market: MarketCode;
}) {
  if (!products.length) return null;
  return (
    <section>
      <SectionHeading title={title} href={href} linkLabel="View all" />
      <AutoScroller label={title.replace(/^W+/, "")} className="-mx-3 px-3 py-1 sm:mx-0 sm:px-0">
        {products.map((p) => (
          <div key={p.slug} className="w-36 shrink-0 sm:w-44">
            <ProductTile product={p} market={market} />
          </div>
        ))}
      </AutoScroller>
    </section>
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
