// Verified-buyer reviews: only a delivered order line can be reviewed, once (the buyer may edit it).
// Product.ratingAvg / ratingCount mirror the published reviews for listings and structured data.
import { prisma } from "@/lib/db";
import { MARKET_CODES, normalizeMobile } from "@/lib/markets";

export const REVIEW_STATUSES = ["published", "hidden"] as const;

/** Recomputes a product's average and count from its published reviews. */
export async function refreshProductRating(productId: string) {
  const agg = await prisma.productReview.aggregate({
    where: { productId, status: "published" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count._all },
  });
}

/** "ayesha khan" → "Ayesha K."; empty → "Verified buyer". */
export function publicReviewerName(name: string | null | undefined) {
  const parts = (name ?? "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (!parts.length || /@/.test(parts[0])) return "Verified buyer";
  const first = parts[0][0].toUpperCase() + parts[0].slice(1).toLowerCase();
  return parts.length > 1 ? `${first} ${parts[parts.length - 1][0].toUpperCase()}.` : first;
}

/** Who is asking to review: a signed-in buyer, or a guest proving the order like on Track order. */
export type ReviewerProof = { userId?: string | null; orderNumber?: string; contact?: string };

/**
 * The order line if this person bought it and it was delivered; otherwise a reason it can't be
 * reviewed. Guests prove ownership with the order number plus the email or mobile used at checkout.
 */
export async function reviewableItem(orderItemId: string, proof: ReviewerProof) {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: {
      order: { select: { id: true, orderNumber: true, status: true, customerId: true, customerEmail: true, customerPhone: true, shippingAddress: true } },
      review: true,
    },
  });
  if (!item) return { ok: false as const, error: "Order item not found" };
  const o = item.order;
  const contact = proof.contact?.trim() ?? "";
  const phones = MARKET_CODES.map((m) => normalizeMobile(m, contact)).filter(Boolean);
  const owner =
    (proof.userId && o.customerId === proof.userId) ||
    (proof.orderNumber === o.orderNumber &&
      !!contact &&
      (o.customerEmail.toLowerCase() === contact.toLowerCase() || (!!o.customerPhone && phones.includes(o.customerPhone))));
  if (!owner) return { ok: false as const, error: "You can only review products from your own orders" };
  if (o.status !== "DELIVERED") return { ok: false as const, error: "You can review this product once your order is delivered" };
  return { ok: true as const, item, order: o };
}
