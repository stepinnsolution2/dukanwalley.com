import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCartOwner, getOrCreateCartOwner } from "@/lib/cart-session";

const bodySchema = z.object({ productId: z.string().min(1) });

/** Favourites share the cart's owner key: the user, or the guest cart session. */
export async function GET() {
  const owner = await getCartOwner();
  const favorites = owner
    ? await prisma.favorite.findMany({ where: owner, select: { productId: true } })
    : [];
  return NextResponse.json({ productIds: favorites.map((f) => f.productId) });
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "productId required" }, { status: 400 });
  const { productId } = parsed.data;
  if (!(await prisma.product.findUnique({ where: { id: productId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  const owner = await getOrCreateCartOwner();
  const key =
    "userId" in owner
      ? { userId_productId: { userId: owner.userId, productId } }
      : { sessionId_productId: { sessionId: owner.sessionId, productId } };
  await prisma.favorite.upsert({ where: key, create: { ...owner, productId }, update: {} });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "productId required" }, { status: 400 });
  const owner = await getCartOwner();
  if (owner) await prisma.favorite.deleteMany({ where: { ...owner, productId: parsed.data.productId } });
  return NextResponse.json({ ok: true });
}
