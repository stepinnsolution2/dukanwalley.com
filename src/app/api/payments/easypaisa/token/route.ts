import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { appBaseUrl, autoPostHtml } from "@/lib/payments/common";
import { easypaisaConfirmForm } from "@/lib/payments/easypaisa";
import { OrderStatus } from "@/generated/prisma/enums";

/** Step 2 of Easypay checkout: Easypay sends the buyer here with ?auth_token=…; forward it to Confirm.jsf. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order");
  const authToken = url.searchParams.get("auth_token");
  const app = appBaseUrl(req.url);

  const order = orderId
    ? await prisma.order.findFirst({
        where: { id: orderId, paymentProvider: "easypaisa", status: OrderStatus.PENDING_PAYMENT },
      })
    : null;
  if (!order || !authToken) {
    return NextResponse.redirect(new URL("/cart?payment=failed", app), 303);
  }

  const { action, fields } = easypaisaConfirmForm(
    authToken,
    `${app}/api/payments/easypaisa/return?order=${encodeURIComponent(order.id)}`,
  );
  return new NextResponse(autoPostHtml(action, fields), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
