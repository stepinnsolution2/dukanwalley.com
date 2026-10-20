import { prisma } from "@/lib/db";
import { storefrontProductWhere } from "@/lib/catalog";
import type { CartOwner } from "@/lib/cart-session";
import type { MarketCode } from "@/lib/markets";
import { isColorKey, type VariantOptions } from "@/lib/variants";
import { OrderStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

/**
 * "You may also like" suggestions for a shopper's cart.
 *
 * Every candidate gets a score from four groups of signals (each 0–1, then weighted):
 *   5 × bought together  — how often it shares an order with a cart item
 *   3 × personal         — the shopper viewed (recently counts more) or favourited it
 *   2 × category         — same category as a cart item, or a sibling/parent; or one they browse a lot
 *   1 × match            — price close to the cart's, and the cart's size/colour in stock
 *   1 × boost            — best seller, Hot product, Top seller
 * Hard rules: live in the shopper's market, in stock, not in the cart, not bought in the last
 * 30 days, the cart's size available (for products in the same department), ≤2 per seller.
 */

export const WEIGHTS = { boughtTogether: 5, personal: 3, category: 2, match: 1, boost: 1 } as const;

/** Main reason shown on a suggestion and logged with its events. */
export type RecommendationReason =
  | "bought_together"
  | "viewed"
  | "favourite"
  | "similar"
  | "browsing"
  | "hot"
  | "popular";

export const REASON_LABELS: Record<RecommendationReason, string> = {
  bought_together: "Often bought together",
  viewed: "You viewed this",
  favourite: "In your favourites",
  similar: "Similar to your cart",
  browsing: "Based on your browsing",
  hot: "Hot right now",
  popular: "Popular",
};

export type Recommendation = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number;
  /** Variants priced differently: show "From". */
  priceVaries: boolean;
  /** Set when one tap can add it: no options, or exactly one in-stock option fits the cart. */
  addable: boolean;
  variantId: string | null;
  reason: RecommendationReason;
};

/** Orders that count as real purchases. */
const SOLD: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

const DAY = 24 * 60 * 60 * 1000;
const MAX_PER_VENDOR = 2;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** The biggest weighted contributor explains the suggestion to the shopper. */
function reasonFor(
  parts: Record<keyof typeof WEIGHTS, number>,
  p: { favourite: boolean; hot: boolean; cartEmpty: boolean },
): RecommendationReason {
  const top = (Object.keys(parts) as (keyof typeof WEIGHTS)[]).reduce((a, b) => (parts[b] > parts[a] ? b : a));
  if (parts[top] === 0) return p.hot ? "hot" : "popular"; // no signal: a featured fallback
  if (top === "boughtTogether") return "bought_together";
  if (top === "personal") return p.favourite ? "favourite" : "viewed";
  if (top === "category" || top === "match") return p.cartEmpty ? "browsing" : "similar";
  return p.hot ? "hot" : "popular";
}

export async function getRecommendations({
  owner,
  market,
  limit = 10,
}: {
  owner: CartOwner | null;
  market: MarketCode;
  limit?: number;
}): Promise<Recommendation[]> {
  const now = Date.now();

  const [cart, views, favourites, recentPurchases, categories] = await Promise.all([
    owner
      ? prisma.cart.findUnique({
          where: owner,
          include: {
            items: {
              include: {
                product: { select: { categoryId: true, basePrice: true } },
                variant: { select: { options: true, price: true } },
              },
            },
          },
        })
      : null,
    owner
      ? prisma.productViewEvent.findMany({
          where: { ...owner, createdAt: { gte: new Date(now - 30 * DAY) } },
          select: { productId: true, createdAt: true, product: { select: { categoryId: true } } },
          orderBy: { createdAt: "desc" },
          take: 300,
        })
      : [],
    owner ? prisma.favorite.findMany({ where: owner, select: { productId: true } }) : [],
    owner && "userId" in owner
      ? prisma.orderItem.findMany({
          where: {
            order: { customerId: owner.userId, status: { in: SOLD }, createdAt: { gte: new Date(now - 30 * DAY) } },
          },
          select: { productId: true },
        })
      : [],
    prisma.category.findMany({ select: { id: true, parentId: true } }),
  ]);

  const items = cart?.items ?? [];
  const inCart = new Set(items.map((i) => i.productId));
  const exclude = new Set([...inCart, ...recentPurchases.map((p) => p.productId)]);

  // --- Category relations ---------------------------------------------------------------
  const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
  const rootOf = (id: string) => {
    let cur = id;
    for (let i = 0; i < 10 && parentOf.get(cur); i++) cur = parentOf.get(cur)!;
    return cur;
  };
  const cartCategories = new Set(items.map((i) => i.product.categoryId));
  // Siblings and parents of cart categories count as "near".
  const nearCategories = new Set<string>();
  for (const id of cartCategories) {
    const parent = parentOf.get(id);
    if (parent) {
      nearCategories.add(parent);
      for (const c of categories) if (c.parentId === parent) nearCategories.add(c.id);
    }
    for (const c of categories) if (c.parentId === id) nearCategories.add(c.id);
  }

  // --- What the cart tells us about size, colour and budget --------------------------
  const sizesByRoot = new Map<string, Set<string>>();
  const cartColours = new Set<string>();
  for (const i of items) {
    const opts = (i.variant?.options ?? {}) as VariantOptions;
    for (const [k, v] of Object.entries(opts)) {
      if (k === "size") {
        const root = rootOf(i.product.categoryId);
        if (!sizesByRoot.has(root)) sizesByRoot.set(root, new Set());
        sizesByRoot.get(root)!.add(v);
      } else if (isColorKey(k)) cartColours.add(v.toLowerCase());
    }
  }
  const cartPrices = items.map((i) => Number(i.variant?.price ?? i.product.basePrice));
  const avgPrice = cartPrices.length ? cartPrices.reduce((s, p) => s + p, 0) / cartPrices.length : null;

  // --- Personal interest: recency-weighted views (7-day half-life-ish) and favourites ---
  const viewScore = new Map<string, number>();
  const categoryInterest = new Map<string, number>();
  for (const v of views) {
    const w = Math.exp(-(now - v.createdAt.getTime()) / (7 * DAY));
    viewScore.set(v.productId, (viewScore.get(v.productId) ?? 0) + w);
    categoryInterest.set(v.product.categoryId, (categoryInterest.get(v.product.categoryId) ?? 0) + w);
  }
  const favouriteIds = new Set(favourites.map((f) => f.productId));
  const maxInterest = Math.max(0, ...categoryInterest.values());

  // --- Bought together (co-occurrence in real orders) ----------------------------------
  const together = inCart.size
    ? await prisma.$queryRaw<{ productId: string; orders: bigint }[]>`
        SELECT b."productId", COUNT(DISTINCT b."orderId") AS orders
        FROM "OrderItem" a
        JOIN "OrderItem" b ON b."orderId" = a."orderId" AND b."productId" <> a."productId"
        JOIN "Order" o ON o."id" = a."orderId"
        WHERE a."productId" IN (${Prisma.join([...inCart])})
          AND o."status"::text IN (${Prisma.join(SOLD)})
        GROUP BY b."productId"
        ORDER BY orders DESC
        LIMIT 60`
    : [];
  const togetherScore = new Map(together.map((t) => [t.productId, Number(t.orders)]));
  const maxTogether = Math.max(1, ...togetherScore.values());

  // --- Popularity: units sold in the last 30 days --------------------------------------
  const live = storefrontProductWhere(market);
  const sales = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: { product: live, order: { status: { in: SOLD }, createdAt: { gte: new Date(now - 30 * DAY) } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 40,
  });
  const salesScore = new Map(sales.map((s) => [s.productId, s._sum.quantity ?? 0]));
  const maxSales = Math.max(1, ...salesScore.values());

  // --- Candidate pool --------------------------------------------------------------------
  const topInterestCategories = [...categoryInterest.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
  const poolCategories = [...new Set([...cartCategories, ...nearCategories, ...topInterestCategories])];
  const [fromCategories, fromBoosts] = await Promise.all([
    poolCategories.length
      ? prisma.product.findMany({
          where: { ...live, categoryId: { in: poolCategories } },
          select: { id: true },
          orderBy: [{ featuredPriority: "desc" }, { updatedAt: "desc" }],
          take: 80,
        })
      : [],
    prisma.product.findMany({
      where: { ...live, OR: [{ isHot: true }, { vendor: { isTopSeller: true } }] },
      select: { id: true },
      orderBy: [{ featuredPriority: "desc" }, { updatedAt: "desc" }],
      take: 30,
    }),
  ]);
  const poolIds = new Set([
    ...togetherScore.keys(),
    ...viewScore.keys(),
    ...favouriteIds,
    ...salesScore.keys(),
    ...fromCategories.map((p) => p.id),
    ...fromBoosts.map((p) => p.id),
  ]);
  for (const id of exclude) poolIds.delete(id);

  // Cold start (new store, no history): fall back to featured products.
  if (poolIds.size < limit) {
    const featured = await prisma.product.findMany({
      where: { ...live, id: { notIn: [...exclude] } },
      select: { id: true },
      orderBy: [{ featuredPriority: "desc" }, { updatedAt: "desc" }],
      take: limit * 2,
    });
    for (const p of featured) poolIds.add(p.id);
  }
  if (!poolIds.size) return [];

  const candidates = await prisma.product.findMany({
    where: { ...live, id: { in: [...poolIds] }, stock: { gt: 0 } },
    select: {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      categoryId: true,
      vendorId: true,
      isHot: true,
      vendor: { select: { isTopSeller: true } },
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
      variants: { select: { id: true, options: true, stock: true, price: true } },
    },
  });

  // --- Score -----------------------------------------------------------------------------
  const scored: { rec: Recommendation; score: number; vendorId: string }[] = [];
  for (const p of candidates) {
    const inStockVariants = p.variants.filter((v) => v.stock > 0);
    if (p.variants.length && !inStockVariants.length) continue;

    // Size rule: in the same department as a sized cart item, the shopper's size must be in stock.
    const wantedSizes = sizesByRoot.get(rootOf(p.categoryId));
    const hasSizes = inStockVariants.some((v) => "size" in (v.options as VariantOptions));
    let fitting = inStockVariants;
    if (wantedSizes && hasSizes) {
      fitting = inStockVariants.filter((v) => wantedSizes.has((v.options as VariantOptions).size));
      if (!fitting.length) continue;
    }
    const colourMatch = fitting.some((v) =>
      Object.entries(v.options as VariantOptions).some(([k, val]) => isColorKey(k) && cartColours.has(val.toLowerCase())),
    );

    const prices = p.variants.length
      ? inStockVariants.map((v) => Number(v.price ?? p.basePrice))
      : [Number(p.basePrice)];
    const price = Math.min(...prices);

    const boughtTogether = (togetherScore.get(p.id) ?? 0) / maxTogether;
    const viewed = clamp01(viewScore.get(p.id) ?? 0);
    const favourite = favouriteIds.has(p.id) ? 1 : 0;
    const personal = clamp01(viewed + favourite);
    const sameCategory = cartCategories.has(p.categoryId) ? 1 : nearCategories.has(p.categoryId) ? 0.6 : 0;
    const interest = maxInterest ? (categoryInterest.get(p.categoryId) ?? 0) / maxInterest : 0;
    const category = Math.max(sameCategory, 0.5 * interest);
    // Within half to double the cart's average price is a perfect match; further away fades out.
    const priceMatch = avgPrice ? clamp01(2 - Math.abs(Math.log2(price / avgPrice))) : 0;
    const sizeColour = (wantedSizes && hasSizes ? 0.5 : 0) + (colourMatch ? 0.5 : 0);
    const match = (priceMatch + sizeColour) / 2;
    const popular = (salesScore.get(p.id) ?? 0) / maxSales;
    const boost = clamp01(popular + (p.isHot ? 0.5 : 0) + (p.vendor.isTopSeller ? 0.5 : 0));

    const parts = {
      boughtTogether: WEIGHTS.boughtTogether * boughtTogether,
      personal: WEIGHTS.personal * personal,
      category: WEIGHTS.category * category,
      match: WEIGHTS.match * match,
      boost: WEIGHTS.boost * boost,
    };
    const score = parts.boughtTogether + parts.personal + parts.category + parts.match + parts.boost;

    const reason = reasonFor(parts, { favourite: !!favourite, hot: p.isHot, cartEmpty: !items.length });

    // One-tap add needs a single obvious option; otherwise the shopper picks on the product page.
    const colourFits = fitting.filter((v) =>
      Object.entries(v.options as VariantOptions).some(([k, val]) => isColorKey(k) && cartColours.has(val.toLowerCase())),
    );
    const pick = !p.variants.length ? null : fitting.length === 1 ? fitting[0] : colourFits.length === 1 ? colourFits[0] : null;

    scored.push({
      score,
      vendorId: p.vendorId,
      rec: {
        id: p.id,
        slug: p.slug,
        name: p.name,
        imageUrl: p.images[0]?.url ?? null,
        price: pick ? Number(pick.price ?? p.basePrice) : price,
        priceVaries: !pick && new Set(prices).size > 1,
        addable: !p.variants.length || !!pick,
        variantId: pick?.id ?? null,
        reason,
      },
    });
  }

  // --- Pick the best, at most MAX_PER_VENDOR from one seller ----------------------------
  scored.sort((a, b) => b.score - a.score);
  const perVendor = new Map<string, number>();
  const out: Recommendation[] = [];
  for (const s of scored) {
    const n = perVendor.get(s.vendorId) ?? 0;
    if (n >= MAX_PER_VENDOR) continue;
    perVendor.set(s.vendorId, n + 1);
    out.push(s.rec);
    if (out.length >= limit) break;
  }
  return out;
}
