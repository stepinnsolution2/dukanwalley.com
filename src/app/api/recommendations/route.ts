import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCartOwner } from "@/lib/cart-session";
import { getCurrentMarket } from "@/lib/market-session";
import { getRecommendations, REASON_LABELS } from "@/lib/recommendations";

/** "You may also like" for the current shopper's cart (works for an empty cart and for guests). */
export async function GET() {
  const owner = await getCartOwner();
  // Suggest from the cart's store; an empty cart follows the storefront being browsed.
  const first = owner
    ? await prisma.cartItem.findFirst({
        where: { cart: owner },
        select: { product: { select: { vendor: { select: { market: true } } } } },
      })
    : null;
  const market = first?.product.vendor.market ?? (await getCurrentMarket());
  const items = await getRecommendations({ owner, market, limit: 12 });
  return NextResponse.json({
    market,
    items: items.map((i) => ({ ...i, reasonLabel: REASON_LABELS[i.reason] })),
  });
}
