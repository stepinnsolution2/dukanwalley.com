import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const CART_COOKIE = "mp_cart_session";

/** Unique key of the current cart; usable directly as a `cart` where/create input. */
export type CartOwner = { userId: string } | { sessionId: string };

/** Moves a guest cart's items into the user's cart, then drops the guest cart. */
async function mergeGuestCart(userId: string, guestSessionId: string) {
  await prisma.$transaction(async (tx) => {
    const withMarket = {
      items: { include: { product: { select: { vendor: { select: { market: true } } } } } },
    } as const;
    const guest = await tx.cart.findUnique({
      where: { sessionId: guestSessionId },
      include: withMarket,
    });
    if (!guest) return;
    // Delete first: a concurrent request doing the same merge blocks here and then sees count 0.
    const removed = await tx.cart.deleteMany({ where: { id: guest.id } });
    if (removed.count === 0) return;
    const userCart = await tx.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: withMarket,
    });
    // A cart holds one market; if the user's cart already has items, keep only matching guest items.
    const market = userCart.items[0]?.product.vendor.market;
    for (const item of guest.items) {
      if (market && item.product.vendor.market !== market) continue;
      await tx.cartItem.upsert({
        where: {
          cartId_productId_variantKey: { cartId: userCart.id, productId: item.productId, variantKey: item.variantKey },
        },
        create: {
          cartId: userCart.id,
          productId: item.productId,
          variantId: item.variantId,
          variantKey: item.variantKey,
          quantity: item.quantity,
        },
        update: { quantity: { increment: item.quantity } },
      });
    }
  });
}

/** Moves a guest's favourites to the user (skipping ones they already have). */
async function mergeGuestFavorites(userId: string, guestSessionId: string) {
  const guest = await prisma.favorite.findMany({ where: { sessionId: guestSessionId } });
  if (!guest.length) return;
  await prisma.$transaction([
    prisma.favorite.createMany({
      data: guest.map((f) => ({ userId, productId: f.productId })),
      skipDuplicates: true,
    }),
    prisma.favorite.deleteMany({ where: { sessionId: guestSessionId } }),
  ]);
}

/**
 * Read-only version for Server Components (which can't set cookies): the user, or the
 * guest session, without merging or starting one.
 */
export async function peekCartOwner(): Promise<CartOwner | null> {
  const session = await auth();
  if (session?.user?.id) return { userId: session.user.id };
  const guestSessionId = (await cookies()).get(CART_COOKIE)?.value;
  return guestSessionId ? { sessionId: guestSessionId } : null;
}

async function resolveCartOwner(createSession: boolean): Promise<CartOwner | null> {
  const session = await auth();
  const jar = await cookies();
  const guestSessionId = jar.get(CART_COOKIE)?.value;

  if (session?.user?.id) {
    if (guestSessionId) {
      await mergeGuestCart(session.user.id, guestSessionId);
      await mergeGuestFavorites(session.user.id, guestSessionId);
      // Browsing history follows the shopper into their account (for suggestions).
      await prisma.productViewEvent.updateMany({
        where: { sessionId: guestSessionId },
        data: { userId: session.user.id, sessionId: null },
      });
      jar.delete(CART_COOKIE);
    }
    return { userId: session.user.id };
  }
  if (guestSessionId) return { sessionId: guestSessionId };
  if (!createSession) return null;

  const sessionId = randomUUID();
  jar.set(CART_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return { sessionId };
}

/**
 * The signed-in user's cart key, or the guest session's. A guest cart left over
 * from before login is merged into the user's cart. Null for a guest with no cart yet.
 * Only call from Route Handlers or Server Functions (it may set cookies).
 */
export function getCartOwner() {
  return resolveCartOwner(false);
}

/** Like getCartOwner, but starts a guest session when there is none. */
export async function getOrCreateCartOwner() {
  return (await resolveCartOwner(true))!;
}
