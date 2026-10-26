import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { isMarketCode } from "@/lib/markets";
import { ProductApprovalStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 50;

/**
 * Catalog list for staff. Filters: status, market, vendorId, visibility (live|hidden), q
 * (name or SKU), page.
 */
export async function GET(req: Request) {
  const authz = await requirePermission("products:view");
  if (!authz.ok) return authz.response;
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  if (status && !(status in ProductApprovalStatus)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }
  const market = sp.get("market");
  const visibility = sp.get("visibility");
  const q = sp.get("q")?.trim();
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const where: Prisma.ProductWhereInput = {
    ...(status ? { approvalStatus: status as ProductApprovalStatus } : {}),
    ...(isMarketCode(market) ? { vendor: { market } } : {}),
    ...(sp.get("vendorId") ? { vendorId: sp.get("vendorId")! } : {}),
    ...(visibility === "live" ? { displayOnStorefront: true, availableForSale: true } : {}),
    ...(visibility === "hidden" ? { displayOnStorefront: false } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        images: { take: 1, orderBy: { sortOrder: "asc" } },
        category: { select: { name: true } },
        vendor: { select: { id: true, storeName: true, market: true } },
        salesPerson: { include: { user: { select: { name: true, email: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
  ]);
  return NextResponse.json({ products, total, page, pageSize: PAGE_SIZE });
}

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  // mark-hot / unmark-hot = Trending (the flag was called Hot before).
  action: z.enum(["hide", "show", "stop-selling", "start-selling", "mark-hot", "unmark-hot", "mark-popular", "unmark-popular"]),
});

/** Bulk moderation: hide/show listings, stop/start sales, or mark approved ones hot. */
export async function POST(req: Request) {
  const authz = await requirePermission("products:edit");
  if (!authz.ok) return authz.response;
  const parsed = bulkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { ids, action } = parsed.data;

  // Only approved products can go live; hiding also stops sales.
  const approved = { approvalStatus: ProductApprovalStatus.APPROVED };
  const result = await {
    hide: () => prisma.product.updateMany({ where: { id: { in: ids } }, data: { displayOnStorefront: false, availableForSale: false } }),
    show: () => prisma.product.updateMany({ where: { id: { in: ids }, ...approved }, data: { displayOnStorefront: true } }),
    "stop-selling": () => prisma.product.updateMany({ where: { id: { in: ids } }, data: { availableForSale: false } }),
    "start-selling": () =>
      prisma.product.updateMany({
        where: { id: { in: ids }, ...approved, displayOnStorefront: true },
        data: { availableForSale: true },
      }),
    "mark-hot": () => prisma.product.updateMany({ where: { id: { in: ids }, ...approved }, data: { isHot: true } }),
    "unmark-hot": () => prisma.product.updateMany({ where: { id: { in: ids } }, data: { isHot: false } }),
    "mark-popular": () => prisma.product.updateMany({ where: { id: { in: ids }, ...approved }, data: { isPopular: true } }),
    "unmark-popular": () => prisma.product.updateMany({ where: { id: { in: ids } }, data: { isPopular: false } }),
  }[action]();

  await prisma.auditLog.create({
    data: {
      userId: authz.session.user.id,
      action: `PRODUCT_BULK_${action.toUpperCase().replace("-", "_")}`,
      entity: "Product",
      meta: { ids, updated: result.count },
    },
  });
  return NextResponse.json({ updated: result.count, skipped: ids.length - result.count });
}
