import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicProductOmit, sellableVendorWhere, withInheritedAttributes } from "@/lib/catalog";
import { publicVendor } from "@/lib/vendor-slug";

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
    omit: publicProductOmit,
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      videos: { orderBy: { sortOrder: "asc" } },
      category: { include: { attributeDefs: true } },
      vendor: { select: { id: true, storeName: true, displayName: true, logoUrl: true, market: true } },
    },
  });
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [full] = await withInheritedAttributes([product]);
  return NextResponse.json({ product: { ...full, vendor: publicVendor(product.vendor) } });
}
