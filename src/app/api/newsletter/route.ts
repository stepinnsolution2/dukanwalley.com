import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(20).optional(),
  source: z.string().trim().max(40).optional(),
});

/** Public newsletter signup. Always answers the same way, so it can't reveal who's subscribed. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  const d = parsed.data;
  await prisma.newsletterSubscriber.upsert({
    where: { email: d.email },
    update: { status: "ACTIVE", ...(d.phone ? { phone: d.phone } : {}) },
    create: { email: d.email, phone: d.phone || null, source: d.source ?? "website" },
  });
  return NextResponse.json({ ok: true });
}
