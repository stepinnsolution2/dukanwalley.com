import Link from "next/link";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/favorite-button";
import { ProductTile } from "@/components/product-tile";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { inheritedAttributeDefs, sellableVendorWhere, storefrontProductWhere } from "@/lib/catalog";
import { getCurrentMarket } from "@/lib/market-session";
import { formatMoney, MARKETS } from "@/lib/markets";
import { AddToCart, type PickerAxis } from "./add-to-cart";
import { ProductViewTracker } from "./product-detail-client";
import { ProductGallery } from "./product-gallery";
import { ProductSelectionProvider } from "./product-selection";
import { PAGE_WIDE } from "@/lib/page-layout";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await prisma.product.findFirst({
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
  });
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
  const prices = variants.map((v) => v.price ?? Number(product.basePrice));
  const minPrice = prices.length
    ? Math.min(...prices)
    : Number(product.basePrice);
  const maxPrice = prices.length
    ? Math.max(...prices)
    : Number(product.basePrice);
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

  return (
    <>
      <ProductViewTracker slug={slug} />
      <SiteHeader />
      <main className={PAGE_WIDE}>
        <Link
          href="/products"
          className="text-sm font-medium text-teal-700 hover:underline"
        >
          ← Back
        </Link>
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
                <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">
                  {product.name}
                </h1>
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
                </p>
                <p className="text-sm text-zinc-500">
                  Sold by{" "}
                  <Link href={`/products?seller=${product.vendor.id}`} className="font-medium text-zinc-700 hover:text-teal-700">
                    {product.vendor.storeName}
                  </Link>{" "}
                  ·{" "}
                  {product.category.parent ? (
                    <>
                      <Link href={`/products?category=${product.category.parent.slug}`} className="hover:text-teal-700">
                        {product.category.parent.name}
                      </Link>
                      {" › "}
                    </>
                  ) : null}
                  <Link href={`/products?category=${product.category.slug}`} className="hover:text-teal-700">
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
              {product.description ? (
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
                    {product.stock} in stock
                  </p>
                )}
              </div>
            </div>
          </div>
        </ProductSelectionProvider>

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
