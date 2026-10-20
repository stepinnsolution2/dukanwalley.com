import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  cancelOrder,
  notifyOrderCancelled,
  orderTotalMinor,
  sendOrderNotifications,
  settlePayment,
} from "@/lib/orders";
import { PAYMENT_WINDOW_MINUTES } from "@/lib/payments/common";
import { inquirePayment } from "@/lib/payments";
import { OrderStatus } from "@/generated/prisma/enums";

/** Ask gateways about payments older than the payment window plus a grace period. */
const PAYMENT_GRACE_MINUTES = 15;
/** After this, a payment the gateway still calls "pending" (or can't answer about) is cancelled. */
const PAYMENT_GIVE_UP_HOURS = 24;

/**
 * Housekeeping; run every 10–15 minutes with header `x-cron-secret: $CRON_SECRET`.
 * 1. Online payments nobody came back from: ask the gateway, then mark paid or cancel.
 * 2. Cash-on-delivery orders not confirmed in time: cancel and return stock.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const now = Date.now();
  const summary = { paid: 0, cancelledPayments: 0, stillPending: 0, expiredCod: 0 };

  const stalePayments = await prisma.order.findMany({
    where: {
      status: OrderStatus.PENDING_PAYMENT,
      createdAt: { lt: new Date(now - (PAYMENT_WINDOW_MINUTES + PAYMENT_GRACE_MINUTES) * 60_000) },
    },
    take: 100,
  });
  for (const order of stalePayments) {
    let status = await inquirePayment({ ...order, totalMinor: orderTotalMinor(order) });
    if (status.state === "pending" && order.createdAt.getTime() < now - PAYMENT_GIVE_UP_HOURS * 3_600_000) {
      status = { state: "failed", detail: `${status.detail}; gave up after ${PAYMENT_GIVE_UP_HOURS}h` };
    }
    const outcome = await settlePayment(order.id, status);
    if (outcome === "paid") {
      summary.paid++;
      after(() => sendOrderNotifications(order.id));
    } else if (outcome === "cancelled") {
      summary.cancelledPayments++;
    } else {
      summary.stillPending++;
    }
    console.info(`[expire] ${order.orderNumber} ${status.detail} → ${outcome}`);
  }

  const unconfirmedCod = await prisma.order.findMany({
    where: { status: OrderStatus.PLACED, confirmTokenExpiresAt: { lt: new Date(now) } },
    take: 200,
  });
  for (const order of unconfirmedCod) {
    if (await cancelOrder(order.id, [OrderStatus.PLACED], "system", "Not confirmed in time")) {
      summary.expiredCod++;
      after(() => notifyOrderCancelled(order.id, "it wasn't confirmed in time"));
    }
  }

  return NextResponse.json(summary);
}
