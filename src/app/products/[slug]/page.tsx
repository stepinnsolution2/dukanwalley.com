import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { JsonLd } from "@/components/json-ld";
import { ProductTile } from "@/components/product-tile";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { inheritedAttributeDefs, sellableVendorWhere, storefrontProductWhere } from "@/lib/catalog";
import { getCurrentMarket } from "@/lib/market-session";
import { formatMoney, MARKETS } from "@/lib/markets";
import { absoluteUrl, breadcrumbJsonLd, inMarket, marketPlace, metaDescription, SITE_NAME, type Crumb } from "@/lib/seo";
import { publicStoreName, storeHref } from "@/lib/vendor-slug";
import { WasPrice } from "@/components/was-price";
import { loadProductReviews, ProductReviews } from "@/components/product-reviews";
import { Stars } from "@/components/stars";
import { descriptionIntro, isRichDescription, markdownToPlain, ProductDetails } from "@/components/product-details";
import { AddToCart, type PickerAxis } from "./add-to-cart";
import { ProductViewTracker } from "./product-detail-client";
import { ProductGallery } from "./product-gallery";
import { ProductSelectionProvider } from "./product-selection";
import { PAGE_WIDE } from "@/lib/page-layout";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

// One query per request, shared by generateMetadata and the page.
const getProduct = cache((slug: string) =>
  prisma.product.findFirst({
    where: {
      slug,
      approvalStatus: "APPROVED",
      displayOnStorefront: true,
      vendor: sellableVendorWhere,
    },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      videos: { orderBy: { sortOrder: "asc" } },
      category: { include: { parent: { select: { name: true, slug: true } } } },
      vendor: true,
      // ids are created in the order the uploader listed the values, so this keeps that order.
      variants: { orderBy: { id: "asc" } },
    },
  }),
);

/** Lowest and highest selling price across variants (or the base price). */
function priceRange(product: NonNullable<Awaited<ReturnType<typeof getProduct>>>) {
  const prices = product.variants.map((v) => (v.price != null ? Number(v.price) : Number(product.basePrice)));
  return prices.length
    ? { min: Math.min(...prices), max: Math.max(...prices) }
    : { min: Number(product.basePrice), max: Number(product.basePrice) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const market = product.vendor.market;
  const { min } = priceRange(product);
  // Shoppers search "<product> price in Pakistan", so the title and description lead with that.
  const title = `${product.name} Price in ${marketPlace(market)}`;
  const description = metaDescription(
    `${product.name} price ${inMarket(market)}: ${formatMoney(market, min)} from ${publicStoreName(product.vendor)} on ${SITE_NAME}.` +
      (product.description?.trim() ? ` ${markdownToPlain(product.description)}` : ""),
  );
  const path = `/products/${product.slug}`;
  const images = product.images.slice(0, 4).map((i) => ({ url: absoluteUrl(i.url), alt: product.name }));
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", title, description, url: path, ...(images.length ? { images } : {}) },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) notFound();
  const productMarket = product.vendor.market;

  // Option picker: one row per variant attribute the product uses (Size, Color…).
  const variants = product.variants.map((v) => ({
    id: v.id,
    options: v.options as Record<string, string>,
    stock: v.stock,
    price: v.price != null ? Number(v.price) : null,
  }));
  const axes: PickerAxis[] = (await inheritedAttributeDefs(product.categoryId))
    .filter((d) => d.isVariant && variants.some((v) => d.key in v.options))
    .map((d) => {
      const seen = [...new Set(variants.map((v) => v.options[d.key]))];
      const values =
        d.dataType === "select"
          ? d.options.filter((o) => seen.includes(o))
          : seen;
      return { key: d.key, name: d.name, values };
    });
  const { min: minPrice, max: maxPrice } = priceRange(product);
  const inOtherMarket = productMarket !== (await getCurrentMarket());
  // Fills the page below the fold: same seller first, then the same category.
  const related = await prisma.product.findMany({
    where: {
      ...storefrontProductWhere(productMarket),
      id: { not: product.id },
      OR: [{ vendorId: product.vendorId }, { categoryId: product.categoryId }],
    },
    include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
    orderBy: [{ featuredPriority: "desc" }, { updatedAt: "desc" }],
    take: 16,
  });
  related.sort((a, b) => Number(b.vendorId === product.vendorId) - Number(a.vendorId === product.vendorId));

  const path = `/products/${product.slug}`;
  const categoryPath = (s: string) => `/category/${s}`;
  const crumbs: Crumb[] = [
    { name: "Home", path: "/" },
    { name: "All products", path: "/products" },
    ...(product.category.parent
      ? [{ name: product.category.parent.name, path: categoryPath(product.category.parent.slug) }]
      : []),
    { name: product.category.name, path: categoryPath(product.category.slug) },
    { name: product.name, path },
  ];
  // Only facts from the listing itself: no invented brand or condition. Ratings come only from
  // verified buyers' published reviews.
  const reviewData = await loadProductReviews(product.id);
  const m = MARKETS[productMarket];
  const money = (n: number) => n.toFixed(m.fractionDigits);
  const availability = product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
  const seller = { "@type": "Organization", name: publicStoreName(product.vendor) };
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url: absoluteUrl(path),
    ...(product.description ? { description: markdownToPlain(product.description) } : {}),
    ...(product.images.length ? { image: product.images.map((i) => absoluteUrl(i.url)) } : {}),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.ratingCount > 0
      ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue: product.ratingAvg.toFixed(1), reviewCount: product.ratingCount, bestRating: 5, worstRating: 1 },
          review: reviewData.reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            author: { "@type": "Person", name: r.authorName },
            datePublished: r.createdAt.toISOString().slice(0, 10),
            ...(r.title ? { name: r.title } : {}),
            reviewBody: r.body,
          })),
        }
      : {}),
    category: product.category.parent
      ? `${product.category.parent.name} > ${product.category.name}`
      : product.category.name,
    // A listing that's shown but not for sale gets no offer rather than a misleading one.
    ...(product.availableForSale
      ? {
          offers:
            minPrice === maxPrice
              ? { "@type": "Offer", url: absoluteUrl(path), price: money(minPrice), priceCurrency: m.currency, availability, seller }
              : {
                  "@type": "AggregateOffer",
                  url: absoluteUrl(path),
                  lowPrice: money(minPrice),
                  highPrice: money(maxPrice),
                  offerCount: product.variants.length,
                  priceCurrency: m.currency,
                  availability,
                  seller,
                },
        }
      : {}),
  };

  return (
    <>
      <ProductViewTracker slug={slug} />
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <SiteHeader />
      <main className={PAGE_WIDE}>
        <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
          {crumbs.slice(0, -1).map((c, i) => (
            <span key={c.path}>
              {i > 0 ? " › " : ""}
              <Link href={c.path} className="hover:text-teal-700">
                {c.name}
              </Link>
            </span>
          ))}
        </nav>
        <ProductSelectionProvider>
          <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,640px)_minmax(0,1fr)]">
            <ProductGallery
              name={product.name}
              media={[
                ...product.images.map((img) => ({
                  type: "image" as const,
                  url: img.url,
                  color: img.color,
                })),
                ...product.videos.map((v) => ({
                  type: "video" as const,
                  url: v.url,
                })),
              ]}
            />
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
                    {product.name}
                  </h1>
                  {product.ratingCount > 0 ? (
                    <a href="#reviews" className="mt-1 flex items-center gap-1.5 text-sm text-zinc-600 hover:text-teal-700">
                      <Stars rating={product.ratingAvg} />
                      {product.ratingAvg.toFixed(1)} · {product.ratingCount} {product.ratingCount === 1 ? "review" : "reviews"}
                    </a>
                  ) : null}
                </div>
                <FavoriteButton
                  productId={product.id}
                  productName={product.name}
                  className="mt-1"
                />
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <p className="text-2xl font-medium text-teal-800">
                  {minPrice === maxPrice
                    ? formatMoney(productMarket, minPrice)
                    : `${formatMoney(productMarket, minPrice)} – ${formatMoney(productMarket, maxPrice)}`}
                  {minPrice === maxPrice ? (
                    <WasPrice market={productMarket} price={minPrice} compareAt={product.compareAtPrice} className="ml-2 text-base" />
                  ) : null}
                </p>
                <p className="text-sm text-zinc-500">
                  Sold by{" "}
                  <Link href={storeHref(product.vendor)} className="font-medium text-zinc-700 hover:text-teal-700">
                    {publicStoreName(product.vendor)}
                  </Link>{" "}
                  ·{" "}
                  {product.category.parent ? (
                    <>
                      <Link href={categoryPath(product.category.parent.slug)} className="hover:text-teal-700">
                        {product.category.parent.name}
                      </Link>
                      {" › "}
                    </>
                  ) : null}
                  <Link href={categoryPath(product.category.slug)} className="hover:text-teal-700">
                    {product.category.name}
                  </Link>
                </p>
              </div>
              {product.salesTaxBps > 0 && product.vendor.taxRegNo ? (
                <p className="text-xs text-zinc-500">
                  Includes {product.salesTaxBps / 100}%{" "}
                  {MARKETS[productMarket].taxName}
                </p>
              ) : null}
              {isRichDescription(product.description) ? (
                <div className="mt-3 text-zinc-600">
                  <p className="line-clamp-4 whitespace-pre-line">{markdownToPlain(descriptionIntro(product.description))}</p>
                  <a href="#details" className="mt-1 inline-block text-sm font-medium text-teal-700 hover:underline">
                    Full details, specifications and Q&amp;A ↓
                  </a>
                </div>
              ) : product.description ? (
                <p className="mt-3 whitespace-pre-line text-zinc-600">{product.description}</p>
              ) : null}
              <div className="mt-4 max-w-xl">
                {inOtherMarket ? (
                  <form
                    action="/api/market"
                    method="post"
                    className="space-y-2"
                  >
                    <p className="text-sm text-amber-800">
                      This product is sold in our {MARKETS[productMarket].name}{" "}
                      store.
                    </p>
                    <button
                      type="submit"
                      name="market"
                      value={productMarket}
                      className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
                    >
                      Shop in {MARKETS[productMarket].name}
                    </button>
                  </form>
                ) : product.availableForSale ? (
                  <AddToCart
                    productId={product.id}
                    disabled={product.stock <= 0}
                    market={productMarket}
                    basePrice={Number(product.basePrice)}
                    showStockCount={product.showStockCount}
                    axes={axes}
                    variants={variants}
                  />
                ) : (
                  <p className="text-sm text-amber-800">
                    Not available for purchase right now.
                  </p>
                )}
                {product.stock <= 0 ? (
                  <p className="mt-2 text-sm text-red-600">Out of stock</p>
                ) : variants.length ? null : (
                  <p className="mt-2 text-sm text-zinc-500">
                    {product.showStockCount ? `${product.stock} in stock` : "In stock"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </ProductSelectionProvider>

        {isRichDescription(product.description) ? <ProductDetails description={product.description} reviewCount={product.ratingCount} /> : null}
        <ProductReviews avg={product.ratingAvg} count={product.ratingCount} {...reviewData} />

        {related.length ? (
          <section className="mt-8">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">You may also like</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
              {related.map((p) => (
                <ProductTile key={p.id} product={p} market={productMarket} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
