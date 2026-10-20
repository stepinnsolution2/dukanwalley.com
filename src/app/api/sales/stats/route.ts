import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { toCents } from "@/lib/money";
import { Market, OrderStatus } from "@/generated/prisma/enums";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SALES") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await prisma.salesProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) {
    return NextResponse.json({ error: "No sales profile" }, { status: 400 });
  }

  const [
    totalProducts,
    pending,
    approved,
    rejected,
    recentViews,
    orderLines,
  ] = await Promise.all([
    prisma.product.count({ where: { salesPersonId: profile.id } }),
    prisma.product.count({
      where: { salesPersonId: profile.id, approvalStatus: "PENDING_REVIEW" },
    }),
    prisma.product.count({
      where: { salesPersonId: profile.id, approvalStatus: "APPROVED" },
    }),
    prisma.product.count({
      where: { salesPersonId: profile.id, approvalStatus: "REJECTED" },
    }),
    prisma.productViewEvent.count({
      where: { product: { salesPersonId: profile.id } },
    }),
    prisma.orderItem.findMany({
      where: {
        product: { salesPersonId: profile.id },
        order: { status: { notIn: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] } },
      },
      select: { quantity: true, unitPrice: true, order: { select: { market: true } } },
    }),
  ]);

  // Summed per market: PKR and AED can't be added together.
  const revenueCents = new Map<Market, number>();
  for (const l of orderLines) {
    const m = l.order.market;
    revenueCents.set(m, (revenueCents.get(m) ?? 0) + toCents(l.unitPrice) * l.quantity);
  }
  const revenue = [...revenueCents].map(([market, cents]) => ({ market, amount: cents / 100 }));

  return NextResponse.json({
    totalProducts,
    pending,
    approved,
    rejected,
    recentViews,
    attributedRevenue: revenue,
  });
}
