import { prisma } from "@/lib/db";
import { sendBuyerOrderEmail, type BuyerOrderEmail } from "@/lib/customer-emails";
import { sendSms } from "@/lib/twilio";
import { awardOrderPoints, refundRedeemedPoints, reverseEarnedPoints } from "@/lib/rewards";
import { OrderStatus, PaymentMethod } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/** Adds a row to an order's status history. */
export function logOrderEvent(db: Db, orderId: string, status: OrderStatus, actor: string, note?: string) {
  return db.orderEvent.create({ data: { orderId, status, actor, note } });
}

/**
 * Staff transitions after an order is real (COD confirmed or paid). Cancelling a prepaid
 * order needs a refund, which isn't handled here, so it isn't offered.
 */
const FLOW: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.SHIPPED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
};

export function nextStatuses(order: { status: OrderStatus; paymentMethod: PaymentMethod }) {
  const isCod = order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY;
  return (FLOW[order.status] ?? []).filter((s) => s !== OrderStatus.CANCELLED || isCod);
}

/** Books the opposite of every movement of an order (cash never collected / returned). Idempotent. */
async function reverseOrderLedger(tx: Prisma.TransactionClient, orderId: string) {
  const moves = await tx.ledgerMovement.findMany({ where: { orderId } });
  const reversed = new Set(moves.filter((m) => m.kind.startsWith("REVERSAL_")).map((m) => m.kind.slice(9)));
  for (const m of moves) {
    if (m.kind.startsWith("REVERSAL_") || reversed.has(m.kind)) continue;
    await tx.ledgerMovement.create({
      data: {
        fromAccountId: m.toAccountId,
        toAccountId: m.fromAccountId,
        amountCents: m.amountCents,
        currency: m.currency,
        kind: `REVERSAL_${m.kind}`,
        orderId,
        description: `Reversal: ${m.description ?? m.kind}`,
      },
    });
  }
}

async function restock(tx: Prisma.TransactionClient, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    // Unlimited-stock products weren't decremented at checkout.
    await tx.product.updateMany({ where: { id: item.productId, unlimitedStock: false }, data: { stock: { increment: item.quantity } } });
    // updateMany: the variant may have been removed since.
    if (item.variantId) {
      await tx.productVariant.updateMany({
        where: { id: item.variantId, product: { unlimitedStock: false } },
        data: { stock: { increment: item.quantity } },
      });
    }
  }
}

export class TransitionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Moves an order along its lifecycle with the side effects each step needs:
 *  - SHIPPED: records courier/tracking;  DELIVERED: timestamp.
 *  - CANCELLED (COD before delivery) / RETURNED: stock back; COD ledger reversed (no cash
 *    collected); a returned prepaid order gets a REFUND_NEEDED flag.
 *  - Reward points: credited on DELIVERED; spent points refunded on CANCELLED/RETURNED,
 *    earned points taken back on RETURNED.
 * Optimistic: fails with 409 if someone else changed the order first.
 */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  opts: { actor: string; note?: string; courier?: string; trackingNumber?: string },
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new TransitionError("Not found", 404);
  if (!nextStatuses(order).includes(to)) {
    throw new TransitionError(`Can't move an order from ${order.status} to ${to}`, 409);
  }
  if (to === OrderStatus.SHIPPED && !opts.courier?.trim()) {
    throw new TransitionError("Courier is required to mark as shipped");
  }
  const isCod = order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY;

  await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: {
        status: to,
        ...(to === OrderStatus.SHIPPED
          ? { shippedAt: new Date(), courier: opts.courier!.trim(), trackingNumber: opts.trackingNumber?.trim() || null }
          : {}),
        ...(to === OrderStatus.DELIVERED ? { deliveredAt: new Date() } : {}),
      },
    });
    if (res.count === 0) throw new TransitionError("The order changed; reload and try again", 409);

    if (to === OrderStatus.DELIVERED) await awardOrderPoints(tx, order);
    if (to === OrderStatus.CANCELLED || to === OrderStatus.RETURNED) {
      await restock(tx, orderId);
      await refundRedeemedPoints(tx, order);
      if (to === OrderStatus.RETURNED) await reverseEarnedPoints(tx, order);
      if (isCod) {
        await reverseOrderLedger(tx, orderId);
      } else {
        await tx.riskFlag.create({
          data: {
            userId: order.customerId,
            kind: "REFUND_NEEDED",
            score: 50,
            detail: { orderId, orderNumber: order.orderNumber, reason: to },
          },
        });
      }
    }
    await logOrderEvent(tx, orderId, to, opts.actor, opts.note);
  });
  return order;
}

/** Super-admin escape hatch: set any status with a reason, without side effects. */
export async function overrideOrderStatus(orderId: string, to: OrderStatus, actor: string, note: string) {
  await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({ where: { id: orderId }, data: { status: to } });
    if (res.count === 0) throw new TransitionError("Not found", 404);
    await logOrderEvent(tx, orderId, to, actor, `Manual override: ${note}`);
  });
}

const buyerMessages: Partial<Record<OrderStatus, (o: { orderNumber: string; courier: string | null; trackingNumber: string | null }) => string>> = {
  SHIPPED: (o) =>
    `Your order ${o.orderNumber} has shipped${o.courier ? ` with ${o.courier}` : ""}${o.trackingNumber ? ` (tracking ${o.trackingNumber})` : ""}.`,
  DELIVERED: (o) => `Your order ${o.orderNumber} was delivered. Thank you for shopping with us!`,
  RETURNED: (o) => `Your order ${o.orderNumber} has been marked as returned.`,
  CANCELLED: (o) => `Your order ${o.orderNumber} was cancelled.`,
};

/** Emails/SMS the buyer about a status change (shipped, delivered, …). Never throws. */
export async function notifyBuyerStatus(orderId: string, appUrl: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  const make = order && buyerMessages[order.status];
  if (!order || !make) return;
  const text = `${make(order)} Track it: ${appUrl}/orders/track?order=${encodeURIComponent(order.orderNumber)}`;
  const email: BuyerOrderEmail =
    order.status === OrderStatus.SHIPPED
      ? { kind: "shipped", courier: order.courier, trackingNumber: order.trackingNumber }
      : order.status === OrderStatus.DELIVERED
        ? { kind: "delivered" }
        : order.status === OrderStatus.RETURNED
          ? { kind: "returned" }
          : { kind: "cancelled" };
  await Promise.allSettled([
    sendBuyerOrderEmail(orderId, email),
    order.customerPhone ? sendSms(order.customerPhone, text) : Promise.resolve(),
  ]);
}
