// Reward point arithmetic. Pure functions: safe to import from client components.
import { MARKETS, type MarketCode } from "@/lib/markets";

/** Default earn rate: 1% of what the customer paid, as points. Overridable via REWARD_EARN_BPS. */
export const DEFAULT_EARN_BPS = 100;

/** Points can pay for at most this share of an order. */
export const MAX_REDEEM_BPS = 5000;

/** Points earned on an amount paid (minor units). Grows with quantity since it's on the line total. */
export function pointsForAmount(market: MarketCode, paidMinor: number, earnBps: number) {
  return Math.max(0, Math.floor((paidMinor * earnBps) / 10000 / MARKETS[market].rewardPointMinor));
}

/** Discount (minor units) that a number of points is worth. */
export function pointsValueMinor(market: MarketCode, points: number) {
  return points * MARKETS[market].rewardPointMinor;
}

/** How many of the customer's points can be spent on an order of this total. */
export function maxRedeemablePoints(market: MarketCode, totalMinor: number, balance: number) {
  const cap = Math.floor((totalMinor * MAX_REDEEM_BPS) / 10000 / MARKETS[market].rewardPointMinor);
  return Math.max(0, Math.min(balance, cap));
}
