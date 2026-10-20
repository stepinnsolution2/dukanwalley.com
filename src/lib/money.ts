import { Prisma } from "@/generated/prisma/client";
import { minorStep, type MarketCode } from "@/lib/markets";

/** All order math is done in integer minor units (paisa/fils) to avoid float drift. */
export function toCents(amount: number | Prisma.Decimal) {
  return Math.round(Number(amount) * 100);
}

export function fromCents(cents: number) {
  return new Prisma.Decimal((cents / 100).toFixed(2));
}

/**
 * Tax contained in a tax-inclusive amount: gross × rate / (1 + rate),
 * rounded to what the market can charge (whole rupees in PK).
 */
export function includedTaxCents(grossCents: number, taxBps: number, market: MarketCode) {
  const step = minorStep(market);
  return Math.round((grossCents * taxBps) / (10000 + taxBps) / step) * step;
}
