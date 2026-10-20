import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { recordOrderLedger } from "@/lib/ledger";
import { logOrderEvent } from "@/lib/order-lifecycle";
import { formatMoney } from "@/lib/markets";
import {
  alertCompanyOrderSummary,
  notifyBuyerOrder,
  notifyVendorSkuSold,
} from "@/lib/notify";
import { toCents } from "@/lib/money";
import { refundRedeemedPoints } from "@/lib/rewards";
import type { GatewayStatus } from "@/lib/payments/common";
import { sendSms, sendWhatsApp } from "@/lib/twilio";
import { OrderStatus } from "@/generated/prisma/enums";

/** Cash-on-delivery orders not confirmed within this window are cancelled. */
export const COD_CONFIRM_TTL_HOURS = Number(process.env.COD_CONFIRM_TTL_HOURS ?? 48);

export type PaidOutcome = "paid" | "already-handled" | "paid-after-cancel";

/**
 * Moves an online order from PENDING_PAYMENT to PAID, books its ledger and empties the
 * checkout cart. Idempotent (gateways and buyers can repeat callbacks). If the order was
 * already cancelled (e.g. expired) the money still arrived: flag it for a manual refund.
 */
export async function markOrderPaid(orderId: string, opts: { paymentRef?: string } = {}): Promise<PaidOutcome> {
  const outcome = await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
      data: {
        status: OrderStatus.PAID,
        ...(opts.paymentRef ? { paymentIntentId: opts.paymentRef } : {}),
      },
    });
    if (res.count === 0) return null;
    await recordOrderLedger(tx, orderId);
    await logOrderEvent(tx, orderId, OrderStatus.PAID, "gateway", opts.paymentRef ? `Payment ref ${opts.paymentRef}` : undefined);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (order.checkoutCartId) {
      await tx.cartItem.deleteMany({ where: { cartId: order.checkoutCartId } });
    }
    return "paid" as const;
  });
  if (outcome) return outcome;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (order?.status !== OrderStatus.CANCELLED) return "already-handled";
  const existing = await prisma.riskFlag.findFirst({
    where: { kind: "PAID_AFTER_CANCEL", detail: { path: ["orderId"], equals: orderId } },
  });
  if (!existing) {
    await prisma.riskFlag.create({
      data: {
        userId: order.customerId,
        kind: "PAID_AFTER_CANCEL",
        score: 100,
        detail: { orderId, orderNumber: order.orderNumber, paymentRef: opts.paymentRef ?? null },
      },
    });
    console.error(`[payments] ${order.orderNumber} paid after cancellation — refund needed`);
  }
  return "paid-after-cancel";
}

/**
 * Cancels an order still in one of `from` (before anything was booked) and returns its
 * reserved stock and any reward points spent on it. Idempotent.
 */
export async function cancelOrder(orderId: string, from: OrderStatus[], actor = "system", note?: string) {
  return prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: { in: from } },
      data: { status: OrderStatus.CANCELLED },
    });
    if (res.count === 0) return false;
    await logOrderEvent(tx, orderId, OrderStatus.CANCELLED, actor, note);
    await refundRedeemedPoints(tx, await tx.order.findUniqueOrThrow({ where: { id: orderId } }));
    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { increment: item.quantity } },
      });
      // updateMany: the variant may have been removed since.
      if (item.variantId) {
        await tx.productVariant.updateMany({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
      }
    }
    return true;
  });
}

/** Cancels an online order whose payment never completed. */
export function cancelUnpaidOrder(orderId: string, note = "Payment not completed") {
  return cancelOrder(orderId, [OrderStatus.PENDING_PAYMENT], "system", note);
}

/**
 * Applies a gateway's answer to a pending order. Returns what changed so callers can notify
 * (they schedule sendOrderNotifications with `after()` when the result is "paid").
 */
export async function settlePayment(orderId: string, status: GatewayStatus, paymentRef?: string) {
  if (status.state === "paid") return markOrderPaid(orderId, { paymentRef });
  if (status.state === "failed") {
    return (await cancelUnpaidOrder(orderId, `Payment failed: ${status.detail}`)) ? "cancelled" : "already-handled";
  }
  return "pending";
}

/**
 * Cash on delivery confirmed (by the buyer's link or by staff): the sale is real now,
 * so book the ledger. Vendors are notified by the caller.
 */
export async function confirmCodOrder(orderId: string, via: string) {
  return prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.PLACED },
      data: { status: OrderStatus.CONFIRMED, confirmedAt: new Date(), confirmedVia: via },
    });
    if (res.count === 0) return false;
    await recordOrderLedger(tx, orderId);
    await logOrderEvent(tx, orderId, OrderStatus.CONFIRMED, via);
    return true;
  });
}

export function hashConfirmToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** New single-use link token; only its hash is stored. Rotating invalidates older links. */
async function issueConfirmToken(orderId: string) {
  const token = randomBytes(24).toString("base64url");
  await prisma.order.update({
    where: { id: orderId },
    data: {
      confirmTokenHash: hashConfirmToken(token),
      confirmTokenExpiresAt: new Date(Date.now() + COD_CONFIRM_TTL_HOURS * 3_600_000),
    },
  });
  return token;
}

async function confirmationMessage(orderId: string, appUrl: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const token = await issueConfirmToken(orderId);
  const link = `${appUrl}/orders/confirm/${token}`;
  const total = formatMoney(order.market, order.total);
  const text =
    `Please confirm your cash on delivery order ${order.orderNumber} (${total}): ${link} ` +
    `Unconfirmed orders are cancelled after ${COD_CONFIRM_TTL_HOURS} hours.`;
  return { order, link, total, text };
}

/**
 * Asks the buyer to confirm a cash-on-delivery order: WhatsApp first, SMS if WhatsApp
 * isn't configured or is rejected, plus email. If WhatsApp later reports the message as
 * undelivered, the Twilio status webhook calls sendCodConfirmationSmsFallback.
 */
export async function requestCodConfirmation(orderId: string, appUrl: string) {
  try {
    const { order, link, total, text } = await confirmationMessage(orderId, appUrl);
    const results: string[] = [];
    if (order.customerPhone) {
      const contentSid = process.env.TWILIO_WHATSAPP_COD_CONTENT_SID;
      const wa = await sendWhatsApp(order.customerPhone, {
        body: text,
        contentSid,
        variables: { "1": order.orderNumber, "2": total, "3": link },
        statusCallback: `${appUrl}/api/webhooks/twilio/status`,
      });
      if (wa.ok) {
        results.push("whatsapp");
        if (wa.sid) {
          await prisma.order.update({ where: { id: orderId }, data: { confirmMessageSid: wa.sid } });
        }
      } else {
        results.push(`whatsapp failed (${wa.error})`);
        const sms = await sendSms(order.customerPhone, text);
        results.push(sms.ok ? "sms" : `sms failed (${sms.error})`);
      }
    }
    await sendEmail({
      to: order.customerEmail,
      subject: `Please confirm your order ${order.orderNumber}`,
      text,
    });
    results.push("email");
    console.info(`[cod] ${order.orderNumber} confirmation sent via ${results.join(", ")}`);
  } catch (e) {
    console.error("[cod] confirmation request failed", orderId, e);
  }
}

/** WhatsApp confirmation was undelivered: send a fresh link by SMS (at most once). */
export async function sendCodConfirmationSmsFallback(messageSid: string, appUrl: string) {
  const order = await prisma.order.findUnique({ where: { confirmMessageSid: messageSid } });
  if (!order || order.status !== OrderStatus.PLACED || !order.customerPhone) return false;
  // Clear the SID first so repeated callbacks (failed + undelivered) send one SMS.
  const claimed = await prisma.order.updateMany({
    where: { id: order.id, confirmMessageSid: messageSid },
    data: { confirmMessageSid: null },
  });
  if (claimed.count === 0) return false;
  const { text } = await confirmationMessage(order.id, appUrl);
  const sms = await sendSms(order.customerPhone, text);
  console.info(`[cod] ${order.orderNumber} WhatsApp undelivered; SMS fallback ${sms.ok ? "sent" : "failed"}`);
  return sms.ok;
}

/** Tells the buyer an order was cancelled (declined or never confirmed/paid). */
export async function notifyOrderCancelled(orderId: string, reason: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;
  const text = `Your order ${order.orderNumber} was cancelled: ${reason}.`;
  await Promise.allSettled([
    sendEmail({ to: order.customerEmail, subject: `Order ${order.orderNumber} cancelled`, text }),
    order.customerPhone ? sendSms(order.customerPhone, text) : Promise.resolve(),
  ]);
}

/**
 * Emails/SMS the vendors, buyer and company once an order is real (paid, or COD confirmed).
 * Failures are logged, never thrown.
 */
export async function sendOrderNotifications(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { vendor: { include: { user: { select: { email: true } } } } } },
    },
  });
  if (!order) return;

  const vendors = new Map<
    string,
    { storeName: string; email: string; phone: string; lines: string[] }
  >();
  for (const item of order.items) {
    const v = item.vendor;
    if (!vendors.has(v.id)) {
      vendors.set(v.id, { storeName: v.storeName, email: v.user.email, phone: v.phone, lines: [] });
    }
    vendors.get(v.id)!.lines.push(`${item.title} x${item.quantity}`);
  }

  const total = formatMoney(order.market, order.total);
  const results = await Promise.allSettled([
    ...[...vendors.values()].map((v) =>
      notifyVendorSkuSold({
        vendorEmail: v.email,
        vendorPhone: v.phone,
        storeName: v.storeName,
        productName: v.lines.join("; "),
        orderNumber: order.orderNumber,
      }),
    ),
    notifyBuyerOrder({
      email: order.customerEmail,
      phone: order.customerPhone,
      orderNumber: order.orderNumber,
      total,
    }),
    alertCompanyOrderSummary(
      `Order ${order.orderNumber} total ${total} (${order.paymentMethod}, ${order.status}). Buyer ${order.customerEmail}.`,
    ),
  ]);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(`[notify] order ${order.orderNumber}`, r.reason);
    }
  }
}

/** Minor units of an order total, as the gateways expect. */
export function orderTotalMinor(order: { total: { toString(): string } | number }) {
  return toCents(Number(order.total.toString()));
}
