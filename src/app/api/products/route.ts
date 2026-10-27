import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storefrontProductWhere } from "@/lib/catalog";
import { getCurrentMarket } from "@/lib/market-session";
import { isMarketCode, MARKETS } from "@/lib/markets";
import { publicVendor } from "@/lib/vendor-slug";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const zone = searchParams.get("zone")?.trim();
  const requested = searchParams.get("market");
  const market = isMarketCode(requested) ? requested : await getCurrentMarket();

  const products = await prisma.product.findMany({
    where: {
      ...storefrontProductWhere(market),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(zone ? { zoneTags: { has: zone } } : {}),
    },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      category: true,
      vendor: { select: { id: true, storeName: true, displayName: true, logoUrl: true, market: true } },
    },
    orderBy: [{ featuredPriority: "desc" }, { updatedAt: "desc" }],
    take: 48,
  });

  return NextResponse.json({
    market,
    currency: MARKETS[market].currency,
    products: products.map((p) => ({ ...p, vendor: publicVendor(p.vendor) })),
  });
}
