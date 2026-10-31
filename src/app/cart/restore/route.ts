import { NextResponse } from "next/server";
import { adoptGuestCart } from "@/lib/cart-session";
import { prisma } from "@/lib/db";
import { verifyRestoreCartToken } from "@/lib/marketing";

/**
 * "Complete my order" link in cart reminder emails: opens the shopper's guest cart on the
 * device they read the email on, then shows the cart. Signed-in shoppers just see their cart.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const cartId = sp.get("c") ?? "";
  const token = sp.get("t") ?? "";
  const dest = new URL("/cart", req.url);
  for (const [k, v] of sp) if (k.startsWith("utm_")) dest.searchParams.set(k, v);

  if (cartId && verifyRestoreCartToken(cartId, token)) {
    const cart = await prisma.cart.findUnique({ where: { id: cartId }, select: { sessionId: true } });
    if (cart?.sessionId) await adoptGuestCart(cart.sessionId);
  }
  return NextResponse.redirect(dest, 303);
}
