import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { MarketCode } from "@/lib/markets";
import { toCents } from "@/lib/money";
import { DEFAULT_EARN_BPS, pointsForAmount } from "@/lib/reward-rules";

type Db = Prisma.TransactionClient | typeof prisma;
type Tx = Prisma.TransactionClient;

export type RewardKind = "EARNED" | "REDEEMED" | "REDEEM_REFUNDED" | "EARN_REVERSED";

/** Earn rate in basis points of the amount paid (100 = 1%). Admin-set via PlatformSetting. */
export async function getEarnBps(db: Db = prisma) {
  const setting = await db.platformSetting.findUnique({ where: { key: "REWARD_EARN_BPS" } });
  const v = setting?.value as { bps?: number } | undefined;
  return v?.bps ?? DEFAULT_EARN_BPS;
}

export async function getPointsBalance(userId: string, market: MarketCode, db: Db = prisma) {
  const account = await db.rewardAccount.findUnique({ where: { userId_market: { userId, market } } });
  return account?.balance ?? 0;
}

/** Adds a history entry and moves the balance. Skips if the order already has an entry of this kind. */
async function post(tx: Tx, userId: string, market: MarketCode, points: number, kind: RewardKind, orderId: string) {
  if (points === 0) return false;
  const existing = await tx.rewardEntry.findUnique({ where: { orderId_kind: { orderId, kind } } });
  if (existing) return false;
  const account = await tx.rewardAccount.upsert({
    where: { userId_market: { userId, market } },
    create: { userId, market, balance: points },
    update: { balance: { increment: points } },
  });
  await tx.rewardEntry.create({ data: { accountId: account.id, points, kind, orderId } });
  return true;
}

/**
 * Spends points on a new order. The conditional decrement serializes concurrent checkouts,
 * so a balance can't be spent twice. Returns false if the balance is too low.
 */
export async function redeemPoints(tx: Tx, userId: string, market: MarketCode, points: number, orderId: string) {
  const res = await tx.rewardAccount.updateMany({
    where: { userId, market, balance: { gte: points } },
    data: { balance: { decrement: points } },
  });
  if (res.count === 0) return false;
  const account = await tx.rewardAccount.findUniqueOrThrow({ where: { userId_market: { userId, market } } });
  await tx.rewardEntry.create({ data: { accountId: account.id, points: -points, kind: "REDEEMED", orderId } });
  return true;
}

type RewardOrder = { id: string; customerId: string | null; market: MarketCode; pointsRedeemed: number; total: Prisma.Decimal };

/** Cancelled or returned: give back the points spent on the order. Idempotent. */
export function refundRedeemedPoints(tx: Tx, order: RewardOrder) {
  if (!order.customerId || order.pointsRedeemed <= 0) return Promise.resolve(false);
  return post(tx, order.customerId, order.market, order.pointsRedeemed, "REDEEM_REFUNDED", order.id);
}

/** Delivered: credit points on what the customer actually paid. Idempotent. */
export async function awardOrderPoints(tx: Tx, order: RewardOrder) {
  if (!order.customerId) return false;
  const points = pointsForAmount(order.market, toCents(order.total), await getEarnBps(tx));
  return post(tx, order.customerId, order.market, points, "EARNED", order.id);
}

/** Returned after delivery: take back the points it earned (the balance may go negative). */
export async function reverseEarnedPoints(tx: Tx, order: RewardOrder) {
  if (!order.customerId) return false;
  const earned = await tx.rewardEntry.findUnique({ where: { orderId_kind: { orderId: order.id, kind: "EARNED" } } });
  if (!earned) return false;
  return post(tx, order.customerId, order.market, -earned.points, "EARN_REVERSED", order.id);
}
