import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { publicReviewerName, refreshProductRating, reviewableItem } from "@/lib/reviews";

// Links and contact details are the usual review spam; real reviews don't need them.
const noLinks = (s: string) => !/https?:\/\/|www\.|\.(com|pk|net)\b/i.test(s);

const schema = z.object({
  orderItemId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional(),
  body: z.string().trim().min(10, "Write at least a sentence (10+ characters)").max(2000),
  name: z.string().trim().max(40).optional(),
  // Guests: the same proof as Track order.
  orderNumber: z.string().trim().max(60).optional(),
  contact: z.string().trim().max(120).optional(),
});

/** Create or update the buyer's review of one delivered order line. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
    return NextResponse.json({ error: first ?? "Check your review" }, { status: 400 });
  }
  const d = parsed.data;
  if (!noLinks(d.body) || (d.title && !noLinks(d.title))) {
    return NextResponse.json({ error: "Please leave out links and website addresses" }, { status: 400 });
  }
  const session = await auth();
  const check = await reviewableItem(d.orderItemId, { userId: session?.user?.id, orderNumber: d.orderNumber, contact: d.contact });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 403 });

  const address = check.order.shippingAddress as { name?: string } | null;
  const authorName = publicReviewerName(d.name || session?.user?.name || address?.name);
  const data = { rating: d.rating, title: d.title || null, body: d.body, authorName };
  const review = check.item.review
    ? // Editing keeps a staff decision to hide it.
      await prisma.productReview.update({ where: { id: check.item.review.id }, data })
    : await prisma.productReview.create({
        data: {
          ...data,
          productId: check.item.productId,
          orderItemId: check.item.id,
          orderId: check.order.id,
          userId: check.order.customerId,
        },
      });
  await refreshProductRating(check.item.productId);
  return NextResponse.json({ review: { rating: review.rating, title: review.title, body: review.body, authorName: review.authorName, status: review.status } });
}
