import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { orderTotalMinor, sendOrderNotifications, settlePayment } from "@/lib/orders";
import { appBaseUrl } from "@/lib/payments/common";
import { jazzCashStatusFromCode, verifyJazzCashResponse } from "@/lib/payments/jazzcash";

/**
 * JazzCash posts the payment result here (pp_ReturnURL) from the buyer's browser.
 * The body is signed with pp_SecureHash; anything unsigned or mismatched changes nothing.
 * Register this exact URL with JazzCash (they validate it).
 */
export async function POST(req: Request) {
  const app = appBaseUrl(req.url);
  const redirect = (path: string) => NextResponse.redirect(new URL(path, app), 303);

  const form = await req.formData().catch(() => null);
  const fields: Record<string, string> = {};
  for (const [k, v] of form ?? []) if (typeof v === "string") fields[k] = v;

  if (!verifyJazzCashResponse(fields)) {
    console.warn("[jazzcash] return with invalid signature", fields.pp_TxnRefNo);
    return redirect("/cart?payment=failed");
  }
  const order = await prisma.order.findFirst({
    where: { paymentProvider: "jazzcash", paymentIntentId: fields.pp_TxnRefNo },
  });
  if (!order) return redirect("/cart?payment=failed");
  const successPath = `/checkout/success?order=${encodeURIComponent(order.orderNumber)}`;

  if (Number(fields.pp_Amount) !== orderTotalMinor(order)) {
    // Don't mark paid on a different amount; the order stays pending for staff to review.
    console.error(`[jazzcash] ${order.orderNumber} amount mismatch: ${fields.pp_Amount}`);
    return redirect(successPath);
  }

  const status = jazzCashStatusFromCode(fields.pp_ResponseCode, fields.pp_ResponseMessage);
  const outcome = await settlePayment(order.id, status, fields.pp_TxnRefNo);
  if (outcome === "paid") after(() => sendOrderNotifications(order.id));
  console.info(`[jazzcash] ${order.orderNumber} ${status.detail} → ${outcome}`);
  return redirect(status.state === "failed" ? "/cart?payment=failed" : successPath);
}
