import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { orderTotalMinor, sendOrderNotifications, settlePayment } from "@/lib/orders";
import { appBaseUrl } from "@/lib/payments/common";
import { easypaisaInquire } from "@/lib/payments/easypaisa";

/**
 * Final Easypay redirect. Its status params are not signed, so the payment is verified with
 * the inquire-transaction API before anything is marked paid.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const app = appBaseUrl(req.url);
  const redirect = (path: string) => NextResponse.redirect(new URL(path, app), 303);

  const orderId = url.searchParams.get("order");
  const order = orderId
    ? await prisma.order.findFirst({ where: { id: orderId, paymentProvider: "easypaisa" } })
    : null;
  if (!order?.paymentIntentId) return redirect("/cart?payment=failed");
  const successPath = `/checkout/success?order=${encodeURIComponent(order.orderNumber)}`;

  let status = await easypaisaInquire(order.paymentIntentId, orderTotalMinor(order));
  // The buyer backed out: Easypay has nothing paid, so release the stock now rather than
  // waiting for the expiry job. (Forging this only cancels the buyer's own unpaid order.)
  if (status.state === "pending" && url.searchParams.get("status")?.toLowerCase() === "failure") {
    status = { state: "failed", detail: `${status.detail}; buyer returned with failure` };
  }
  const outcome = await settlePayment(order.id, status);
  if (outcome === "paid") after(() => sendOrderNotifications(order.id));
  console.info(`[easypaisa] ${order.orderNumber} ${status.detail} → ${outcome}`);
  return redirect(status.state === "failed" ? "/cart?payment=failed" : successPath);
}
