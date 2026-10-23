import Image from "next/image";
import Link from "next/link";
import { FavoriteButton } from "@/components/favorite-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { peekCartOwner } from "@/lib/cart-session";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/markets";
import { canOptimizeImage } from "@/lib/media-url";
import { PAGE_WIDE } from "@/lib/page-layout";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const owner = await peekCartOwner();
  const favorites = owner
    ? await prisma.favorite.findMany({
        where: owner,
        orderBy: { createdAt: "desc" },
        include: {
          product: {
            include: {
              images: { orderBy: { sortOrder: "asc" }, take: 1 },
              vendor: { select: { market: true } },
            },
          },
        },
      })
    : [];

  return (
    <>
      <SiteHeader />
      <main className={PAGE_WIDE}>
        <h1 className="text-2xl font-semibold text-zinc-900">Favourites</h1>
        {favorites.length === 0 ? (
          <p className="mt-4 text-zinc-600">
            No favourites yet. Tap the heart on a product to save it here.{" "}
            <Link href="/products" className="text-teal-700 underline">
              Browse products
            </Link>
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {favorites.map(({ product: p }) => {
              const buyable = p.approvalStatus === "APPROVED" && p.availableForSale && p.displayOnStorefront;
              return (
                <li key={p.id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
                  <div className="relative aspect-square bg-zinc-100">
                    <Link href={`/products/${p.slug}`}>
                      {p.images[0] ? (
                        <Image src={p.images[0].url} alt="" fill unoptimized={!canOptimizeImage(p.images[0].url)} className="object-cover" sizes="300px" />
                      ) : null}
                    </Link>
                    <FavoriteButton
                      productId={p.id}
                      productName={p.name}
                      className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow"
                    />
                  </div>
                  <div className="p-2">
                    <Link href={`/products/${p.slug}`} className="line-clamp-2 text-sm font-medium hover:text-teal-700">
                      {p.name}
                    </Link>
                    <p className="mt-1 text-sm font-semibold">{formatMoney(p.vendor.market, p.basePrice)}</p>
                    {!buyable ? <p className="mt-1 text-xs text-zinc-500">Currently unavailable</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
