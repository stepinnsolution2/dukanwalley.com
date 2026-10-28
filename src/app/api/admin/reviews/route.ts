import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { refreshProductRating, REVIEW_STATUSES } from "@/lib/reviews";

const PAGE_SIZE = 50;

/** Reviews for moderation, newest first: ?status=published|hidden&rating=1..5&page=n */
export async function GET(req: Request) {
  const authz = await requirePermission("products:review");
  if (!authz.ok) return authz.response;
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const rating = Number(sp.get("rating"));
  const page = Math.max(1, Math.trunc(Number(sp.get("page"))) || 1);
  const where = {
    ...((REVIEW_STATUSES as readonly string[]).includes(status ?? "") ? { status: status! } : {}),
    ...(rating >= 1 && rating <= 5 ? { rating } : {}),
  };
  const [reviews, total] = await Promise.all([
    prisma.productReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: { select: { id: true, name: true, slug: true } },
        orderItem: { select: { order: { select: { id: true, orderNumber: true, customerEmail: true } } } },
      },
    }),
    prisma.productReview.count({ where }),
  ]);
  return NextResponse.json({ reviews, total, pageSize: PAGE_SIZE });
}

const patchSchema = z.object({ id: z.string().min(1), status: z.enum(REVIEW_STATUSES) });

/** Hide or re-publish a review. */
export async function PATCH(req: Request) {
  const authz = await requirePermission("products:review");
  if (!authz.ok) return authz.response;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const review = await prisma.productReview.update({ where: { id: parsed.data.id }, data: { status: parsed.data.status } }).catch(() => null);
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await refreshProductRating(review.productId);
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "REVIEW_STATUS", entity: "ProductReview", entityId: review.id, meta: { status: review.status } },
  });
  return NextResponse.json({ ok: true });
}

/** Deletes a review for good (the buyer can then write a new one). */
export async function DELETE(req: Request) {
  const authz = await requirePermission("products:review");
  if (!authz.ok) return authz.response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const review = await prisma.productReview.delete({ where: { id } }).catch(() => null);
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await refreshProductRating(review.productId);
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "REVIEW_DELETE", entity: "ProductReview", entityId: id, meta: { productId: review.productId, rating: review.rating } },
  });
  return NextResponse.json({ ok: true });
}
