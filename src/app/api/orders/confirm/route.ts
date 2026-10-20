import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cancelOrder, confirmCodOrder, hashConfirmToken, sendOrderNotifications } from "@/lib/orders";
import { appBaseUrl } from "@/lib/payments/common";
import { broadcastAdmin } from "@/lib/realtime";
import { OrderStatus } from "@/generated/prisma/enums";

/** Buyer answers the cash-on-delivery confirmation (form POST from /orders/confirm/[token]). */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const token = form?.get("token");
  const action = form?.get("action");
  if (typeof token !== "string" || (action !== "confirm" && action !== "cancel")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const back = NextResponse.redirect(new URL(`/orders/confirm/${token}`, appBaseUrl(req.url)), 303);

  const order = await prisma.order.findUnique({ where: { confirmTokenHash: hashConfirmToken(token) } });
  if (!order || !order.confirmTokenExpiresAt || order.confirmTokenExpiresAt < new Date()) return back;

  if (action === "confirm") {
    if (await confirmCodOrder(order.id, "customer")) {
      after(() => sendOrderNotifications(order.id));
    }
  } else if (await cancelOrder(order.id, [OrderStatus.PLACED], "customer", "Declined by buyer")) {
    after(() =>
      broadcastAdmin("order:new", { summary: `COD order ${order.orderNumber} cancelled by the buyer` }),
    );
  }
  return back;
}
