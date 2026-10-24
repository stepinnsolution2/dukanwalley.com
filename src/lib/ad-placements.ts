// Advertising sections and banner sizes. Pure data: safe to import from client components.

export type AdPlacement = "home_top" | "home_bottom" | "footer" | "cart" | "checkout";

export const AD_PLACEMENTS: Record<
  AdPlacement,
  { label: string; where: string; width: number; height: number; minWidth: number }
> = {
  home_top: { label: "Home page top", where: "Beside the main banner (below it on phones)", width: 600, height: 500, minWidth: 450 },
  home_bottom: { label: "Home page bottom", where: "Wide strip near the end of the home page", width: 1600, height: 300, minWidth: 1000 },
  footer: { label: "Footer", where: "Wide strip above the footer on every page", width: 1600, height: 200, minWidth: 1000 },
  cart: { label: "Cart", where: "In the cart panel and cart page", width: 1200, height: 250, minWidth: 800 },
  checkout: { label: "Checkout page", where: "Below the checkout form", width: 1200, height: 250, minWidth: 800 },
};

export const PLACEMENT_KEYS = Object.keys(AD_PLACEMENTS) as AdPlacement[];

export function isAdPlacement(v: unknown): v is AdPlacement {
  return typeof v === "string" && v in AD_PLACEMENTS;
}

/** Hero banner size: the 75% column on laptops (~3.2:1), also used full-width on phones. */
export const HERO_SPEC = { width: 1800, height: 560, minWidth: 1200 } as const;

export const PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** A booking's state right now, for admin badges. */
export function bookingState(b: { isActive: boolean; startsAt: Date | string; endsAt: Date | string }, now = Date.now()) {
  if (!b.isActive) return "paused" as const;
  if (now < new Date(b.startsAt).getTime()) return "scheduled" as const;
  if (now > new Date(b.endsAt).getTime()) return "ended" as const;
  return "live" as const;
}

/** The Pakistan calendar date ("YYYY-MM-DD") of an instant; for date inputs in the admin. */
export function toPktDay(d: Date | string | null | undefined) {
  if (!d) return "";
  return new Date(new Date(d).getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
}
