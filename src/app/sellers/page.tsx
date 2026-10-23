import type { Metadata } from "next";
import Link from "next/link";
import { SellerAvatar } from "@/components/seller-avatar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { sellableVendorWhere, storefrontProductWhere } from "@/lib/catalog";
import { getCurrentMarket } from "@/lib/market-session";
import { MARKETS } from "@/lib/markets";
import { PAGE_WIDE } from "@/lib/page-layout";
import { SITE_NAME } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sellers",
  description: `Browse the verified stores selling on ${SITE_NAME} and shop each seller's products.`,
  alternates: { canonical: "/sellers" },
};

export default async function SellersPage() {
  const market = await getCurrentMarket();
  const live = storefrontProductWhere(market);
  const sellers = await prisma.vendorProfile.findMany({
    where: { ...sellableVendorWhere, market, products: { some: live } },
    select: {
      id: true,
      storeName: true,
      logoUrl: true,
      city: true,
      isTopSeller: true,
      _count: { select: { products: { where: live } } },
    },
    orderBy: [{ isTopSeller: "desc" }, { storeName: "asc" }],
  });

  return (
    <>
      <SiteHeader />
      <main className={PAGE_WIDE}>
        <h1 className="text-2xl font-semibold text-zinc-900">Sellers</h1>
        <p className="text-sm text-zinc-500">
          {sellers.length} seller{sellers.length === 1 ? "" : "s"} in {MARKETS[market].name}
        </p>
        {sellers.length === 0 ? (
          <p className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-600">
            No sellers with live products yet.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {sellers.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/products?seller=${s.id}`}
                  className="flex h-full flex-col items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3 text-center hover:border-teal-300 hover:shadow-sm"
                >
                  <SellerAvatar name={s.storeName} logoUrl={s.logoUrl} />
                  <span className="line-clamp-2 text-sm font-medium text-zinc-900">{s.storeName}</span>
                  <span className="text-xs text-zinc-500">
                    {s._count.products} product{s._count.products === 1 ? "" : "s"}
                    {s.city ? ` · ${s.city}` : ""}
                  </span>
                  {s.isTopSeller ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                      Top seller
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
