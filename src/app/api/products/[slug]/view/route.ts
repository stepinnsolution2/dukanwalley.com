import { NextResponse } from "next/server";
import { getOrCreateCartOwner } from "@/lib/cart-session";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ slug: string }> };

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  const product = await prisma.product.findFirst({
    where: {
      slug,
      approvalStatus: "APPROVED",
      displayOnStorefront: true,
    },
  });
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const zone = typeof body.zone === "string" ? body.zone : undefined;
  // Same key as the cart (user, or guest cookie), so views can feed cart suggestions
  // and the abandoned-cart check.
  const owner = await getOrCreateCartOwner();

  await prisma.productViewEvent.create({
    data: { productId: product.id, zone, ...owner },
  });

  return NextResponse.json({ ok: true });
}
