import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/twilio";
import { NotificationCampaignType } from "@/generated/prisma/enums";

/**
 * Interest heuristic: stale cart + contact + (quantity weight) + optional repeat views.
 * Secured with `x-cron-secret: CRON_SECRET`. Schedule daily from your job runner.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const carts = await prisma.cart.findMany({
    where: {
      updatedAt: { lt: cutoff },
      items: { some: {} },
      OR: [{ guestEmail: { not: null } }, { userId: { not: null } }],
    },
    include: {
      items: { include: { product: true } },
      user: { select: { email: true, phone: true } },
    },
    take: 50,
  });

  let sent = 0;
  for (const cart of carts) {
    const email = cart.guestEmail ?? cart.user?.email ?? null;
    const phone = cart.guestPhone ?? cart.user?.phone ?? null;
    if (!email && !phone) continue;

    const productIds = [...new Set(cart.items.map((i) => i.productId))];
    const viewWhere = {
      productId: { in: productIds },
      OR: [
        ...(cart.sessionId ? [{ sessionId: cart.sessionId }] : []),
        ...(cart.userId ? [{ userId: cart.userId }] : []),
      ],
    };
    const viewCount =
      viewWhere.OR.length > 0
        ? await prisma.productViewEvent.count({ where: viewWhere })
        : 0;

    const qtyScore = cart.items.reduce((s, i) => s + i.quantity, 0);
    const score = qtyScore * 10 + viewCount;
    if (score < 12) continue;

    const top = cart.items[0]?.product?.name ?? "your picks";
    const msg = `You left items in your cart (including ${top}). Complete checkout when ready. Offers may expire.`;

    if (email) {
      await sendEmail({
        to: email,
        subject: "Your cart is waiting",
        text: msg,
      });
    }
    if (phone) await sendSms(phone, msg);

    await prisma.notificationCampaignLog.create({
      data: {
        type: NotificationCampaignType.ABANDONED_CART,
        targetEmail: email,
        targetPhone: phone,
        payload: { cartId: cart.id, score },
      },
    });
    sent += 1;
  }

  return NextResponse.json({ processed: carts.length, campaignsSent: sent });
}
