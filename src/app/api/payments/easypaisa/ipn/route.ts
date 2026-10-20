import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { orderTotalMinor, sendOrderNotifications, settlePayment } from "@/lib/orders";
import { easypaisaInquire } from "@/lib/payments/easypaisa";
import { OrderStatus } from "@/generated/prisma/enums";

/**
 * Easypaisa IPN ("IPN Attribute Configurations" in the merchant portal): called as
 * …/ipn?url=<easypay>/order-status/<accountId>/<orderRefNum> when a payment becomes PAID.
 * We never fetch the given URL (it's caller-controlled); we only take the order reference
 * from it and ask the inquire-transaction API ourselves.
 */
export async function GET(req: Request) {
  const given = new URL(req.url).searchParams.get("url") ?? "";
  const orderRefNum = decodeURIComponent(given.split("?")[0].split("/").filter(Boolean).pop() ?? "");
  const order = orderRefNum
    ? await prisma.order.findFirst({
        where: {
          paymentProvider: "easypaisa",
          paymentIntentId: orderRefNum,
          status: OrderStatus.PENDING_PAYMENT,
        },
      })
    : null;
  if (order) {
    const status = await easypaisaInquire(orderRefNum, orderTotalMinor(order));
    const outcome = await settlePayment(order.id, status);
    if (outcome === "paid") after(() => sendOrderNotifications(order.id));
    console.info(`[easypaisa ipn] ${order.orderNumber} ${status.detail} → ${outcome}`);
  }
  return new NextResponse("OK");
}
