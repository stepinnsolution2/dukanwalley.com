import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { peekCartOwner } from "@/lib/cart-session";
import { RecommendationEventKind } from "@/generated/prisma/enums";

const bodySchema = z.object({
  kind: z.nativeEnum(RecommendationEventKind),
  placement: z.string().min(1).max(40),
  items: z
    .array(z.object({ productId: z.string().min(1), reason: z.string().min(1).max(40) }))
    .min(1)
    .max(20),
});

/** Logs suggestions shown, clicked or added to cart (see admin Reports). */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { kind, placement, items } = parsed.data;
  const owner = await peekCartOwner();
  // Ignore unknown product ids rather than failing on the foreign key.
  const known = new Set(
    (await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) } }, select: { id: true } })).map(
      (p) => p.id,
    ),
  );
  const { count } = await prisma.recommendationEvent.createMany({
    data: items
      .filter((i) => known.has(i.productId))
      .map((i) => ({ kind, placement, productId: i.productId, reason: i.reason, ...(owner ?? {}) })),
  });
  return NextResponse.json({ logged: count });
}
