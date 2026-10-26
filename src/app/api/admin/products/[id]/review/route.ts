import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { ProductApprovalStatus } from "@/generated/prisma/enums";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    displayOnStorefront: z.boolean(),
    availableForSale: z.boolean(),
  }),
  z.object({
    action: z.literal("reject"),
    reason: z.string().min(3),
  }),
]);

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const authz = await requirePermission("products:review");
  if (!authz.ok) return authz.response;
  const { session } = authz;
  const { id } = await params;
  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const product = await prisma.product.findUnique({
    where: { id },
    include: { salesPerson: true },
  });
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const b = parsed.data;
  if (b.action === "reject") {
    await prisma.product.update({
      where: { id },
      data: {
        approvalStatus: ProductApprovalStatus.REJECTED,
        rejectionReason: b.reason,
        approvedById: session.user.id,
        approvedAt: new Date(),
        displayOnStorefront: false,
        availableForSale: false,
        isHot: false,
        isPopular: false,
      },
    });
    if (product.salesPersonId) {
      const sp = await prisma.salesProfile.findUnique({
        where: { id: product.salesPersonId },
      });
      if (sp) {
        await prisma.userNotification.create({
          data: {
            userId: sp.userId,
            title: `Product rejected: ${product.name}`,
            body: b.reason,
            link: "/sales/products",
          },
        });
      }
    }
  } else {
    await prisma.product.update({
      where: { id },
      data: {
        approvalStatus: ProductApprovalStatus.APPROVED,
        rejectionReason: null,
        approvedById: session.user.id,
        approvedAt: new Date(),
        displayOnStorefront: b.displayOnStorefront,
        availableForSale: b.availableForSale && b.displayOnStorefront,
      },
    });
    if (product.salesPersonId) {
      const sp = await prisma.salesProfile.findUnique({
        where: { id: product.salesPersonId },
      });
      if (sp) {
        await prisma.userNotification.create({
          data: {
            userId: sp.userId,
            title: `Product approved: ${product.name}`,
            body: b.displayOnStorefront
              ? b.availableForSale
                ? "Live and purchasable on the storefront."
                : "Visible on storefront but not yet for sale."
              : "Approved but hidden from storefront.",
            link: "/sales/products",
          },
        });
      }
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: `PRODUCT_${b.action.toUpperCase()}`,
      entity: "Product",
      entityId: id,
      meta: b as object,
    },
  });

  return NextResponse.json({ ok: true });
}
