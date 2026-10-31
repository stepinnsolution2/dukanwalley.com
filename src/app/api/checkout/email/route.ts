import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { peekCartOwner } from "@/lib/cart-session";
import { captureEmail } from "@/lib/marketing";
import { getCurrentMarket } from "@/lib/market-session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  /** The "Email me offers and new arrivals" box at checkout. */
  newsletter: z.boolean(),
});

/**
 * Checkout saves the email as soon as it's typed, so an unfinished checkout can get a cart
 * reminder. Newsletters only if the box is ticked.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  const { email, newsletter } = parsed.data;
  const owner = await peekCartOwner();
  if (!owner) return NextResponse.json({ ok: true });
  await captureEmail({ email, source: "checkout", newsletter, market: await getCurrentMarket() });
  if ("sessionId" in owner) {
    await prisma.cart.updateMany({ where: { sessionId: owner.sessionId }, data: { guestEmail: email } });
  }
  return NextResponse.json({ ok: true });
}
