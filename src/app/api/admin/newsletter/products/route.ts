import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { storefrontProductWhere } from "@/lib/catalog";
import { isMarketCode } from "@/lib/markets";

/**
 * Product picker for newsletters: live products by name or SKU (`q`), the latest arrivals
 * (`latest=1`), or specific ones (`ids=a,b`), in the campaign's market.
 */
export async function GET(req: Request) {
  const authz = await requirePermission("newsletter:view");
  if (!authz.ok) return authz.response;
  const sp = new URL(req.url).searchParams;
  const market = isMarketCode(sp.get("market")) ? sp.get("market")! : "PK";
  const q = sp.get("q")?.trim();
  const ids = sp.get("ids")?.split(",").filter(Boolean);
  const live = storefrontProductWhere(market as "PK" | "AE");
  const products = await prisma.product.findMany({
    where: ids
      ? { id: { in: ids.slice(0, 20) } }
      : {
          ...live,
          ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {}),
        },
    select: { id: true, name: true, basePrice: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
    orderBy: { createdAt: "desc" },
    take: ids ? 20 : sp.get("latest") ? 8 : 12,
  });
  return NextResponse.json({
    products: products.map((p) => ({ id: p.id, name: p.name, price: Number(p.basePrice), imageUrl: p.images[0]?.url ?? null })),
  });
}
