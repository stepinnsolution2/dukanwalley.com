import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { REASON_LABELS, type RecommendationReason } from "@/lib/recommendations";

export async function GET(req: Request) {
  const authz = await requirePermission("reports:view");
  if (!authz.ok) return authz.response;
  const { searchParams } = new URL(req.url);
  const zone = searchParams.get("zone")?.trim();

  const sold = await prisma.orderItem.groupBy({
    by: ["productId"],
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 20,
  });

  const productIds = sold.map((s) => s.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      slug: true,
      zoneTags: true,
      vendor: { select: { storeName: true } },
    },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const mostSold = sold.map((s) => ({
    productId: s.productId,
    units: s._sum.quantity ?? 0,
    product: productMap.get(s.productId),
  }));

  const views = await prisma.productViewEvent.groupBy({
    by: ["productId"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 20,
    ...(zone
      ? {
          where: {
            OR: [{ zone }, { product: { zoneTags: { has: zone } } }],
          },
        }
      : {}),
  });

  const viewProductIds = views.map((v) => v.productId);
  const viewProducts = await prisma.product.findMany({
    where: { id: { in: viewProductIds } },
    select: { id: true, name: true, slug: true, zoneTags: true },
  });
  const vpMap = new Map(viewProducts.map((p) => [p.id, p]));

  const mostVisited = views.map((v) => ({
    productId: v.productId,
    views: v._count.id,
    product: vpMap.get(v.productId),
  }));

  const funnel = {
    cartsWithItems: await prisma.cart.count({
      where: { items: { some: {} } },
    }),
    newsletterSubscribers: await prisma.newsletterSubscriber.count({
      where: { status: "ACTIVE" },
    }),
  };

  // Cart suggestions over the last 30 days, per reason: how often shown, clicked, added.
  const events = await prisma.recommendationEvent.groupBy({
    by: ["reason", "kind"],
    where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    _count: { id: true },
  });
  const byReason = new Map<string, { reason: string; label: string; shown: number; clicks: number; adds: number }>();
  for (const e of events) {
    const row = byReason.get(e.reason) ?? {
      reason: e.reason,
      label: REASON_LABELS[e.reason as RecommendationReason] ?? e.reason,
      shown: 0,
      clicks: 0,
      adds: 0,
    };
    if (e.kind === "SHOWN") row.shown = e._count.id;
    else if (e.kind === "CLICK") row.clicks = e._count.id;
    else row.adds = e._count.id;
    byReason.set(e.reason, row);
  }
  const suggestions = [...byReason.values()].sort((a, b) => b.shown - a.shown);

  return NextResponse.json({ mostSold, mostVisited, funnel, suggestions, zoneFilter: zone ?? null });
}
