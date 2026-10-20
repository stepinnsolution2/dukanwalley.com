import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { OrderStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

/** Orders that count as sales: excludes card orders never paid and cancellations. */
const booked = {
  status: { notIn: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] },
};

/** Order count and revenue per market (PKR and AED are never summed together). */
async function salesByMarket(where: Prisma.OrderWhereInput) {
  const rows = await prisma.order.groupBy({
    by: ["market"],
    where: { ...booked, ...where },
    _count: { _all: true },
    _sum: { total: true },
  });
  return rows.map((r) => ({
    market: r.market,
    orders: r._count._all,
    revenue: r._sum.total?.toString() ?? "0",
  }));
}

export async function GET() {
  const authz = await requirePermission("reports:view");
  if (!authz.ok) return authz.response;

  const now = Date.now();
  const since = (days: number) => ({ createdAt: { gte: new Date(now - days * 86_400_000) } });

  const [allTime, daily, weekly, monthly, vendorsCount, pendingProducts, openDisputes, fees] =
    await Promise.all([
      salesByMarket({}),
      salesByMarket(since(1)),
      salesByMarket(since(7)),
      salesByMarket(since(30)),
      prisma.vendorProfile.groupBy({ by: ["market"], _count: { _all: true } }),
      prisma.product.count({ where: { approvalStatus: "PENDING_REVIEW" } }),
      prisma.order.count({ where: { status: "DISPUTED" } }),
      prisma.ledgerMovement.groupBy({
        by: ["currency"],
        where: { kind: "PLATFORM_COMMISSION" },
        _sum: { amountCents: true },
      }),
    ]);

  return NextResponse.json({
    sales: allTime,
    windows: { daily, weekly, monthly },
    vendors: vendorsCount.map((v) => ({ market: v.market, count: v._count._all })),
    pendingProducts,
    openDisputes,
    platformCommission: fees.map((f) => ({
      currency: f.currency,
      amountCents: f._sum.amountCents ?? 0,
    })),
  });
}
