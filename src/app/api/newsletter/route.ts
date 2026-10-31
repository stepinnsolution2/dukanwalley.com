import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { peekCartOwner } from "@/lib/cart-session";
import { captureEmail } from "@/lib/marketing";
import { getCurrentMarket } from "@/lib/market-session";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().max(20).optional(),
  source: z.enum(["footer", "popup", "website"]).optional(),
});

/** Public newsletter signup. Always answers the same way, so it can't reveal who's subscribed. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  const d = parsed.data;
  await captureEmail({ email: d.email, phone: d.phone, source: d.source ?? "website", newsletter: true, market: await getCurrentMarket() });
  // A guest's cart can now get reminders at this address.
  const owner = await peekCartOwner();
  if (owner && "sessionId" in owner) {
    await prisma.cart.updateMany({ where: { sessionId: owner.sessionId, guestEmail: null }, data: { guestEmail: d.email } });
  }
  return NextResponse.json({ ok: true });
}
