import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sellableVendorWhere, withInheritedAttributes } from "@/lib/catalog";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const product = await prisma.product.findFirst({
    where: {
      slug,
      approvalStatus: "APPROVED",
      displayOnStorefront: true,
      vendor: sellableVendorWhere,
    },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      videos: { orderBy: { sortOrder: "asc" } },
      category: { include: { attributeDefs: true } },
      vendor: { select: { id: true, storeName: true, logoUrl: true, market: true } },
    },
  });
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ product: (await withInheritedAttributes([product]))[0] });
}
