import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import {
  imageColorFor,
  imageColorsSchema,
  mediaUrlSchema,
  syncProductVariants,
  withInheritedAttributes,
  validateAttributes,
  validateVariants,
  variantsInputSchema,
  UNLIMITED_STOCK,
} from "@/lib/catalog";
import { compareAtPriceError, isValidPrice, priceRuleMessage, taxRuleError } from "@/lib/markets";
import { Prisma } from "@/generated/prisma/client";

const patchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  basePrice: z.number().positive().optional(),
  compareAtPrice: z.number().positive().nullable().optional(),
  showStockCount: z.boolean().optional(),
  unlimitedStock: z.boolean().optional(),
  salesTaxBps: z.number().int().min(0).max(10000).optional(),
  stock: z.number().int().min(0).optional(),
  categoryId: z.string().optional(),
  vendorId: z.string().optional(),
  sku: z.string().optional(),
  featuredPriority: z.number().int().optional(),
  zoneTags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  displayOnStorefront: z.boolean().optional(),
  availableForSale: z.boolean().optional(),
  isHot: z.boolean().optional(),
  isPopular: z.boolean().optional(),
  imageUrls: z
    .array(mediaUrlSchema)
    .min(1, "Keep at least one image")
    .max(12)
    .optional(),
  videoUrls: z.array(mediaUrlSchema).max(5).optional(),
  variants: variantsInputSchema.optional(),
  imageColors: imageColorsSchema.optional(),
});

type Params = { params: Promise<{ id: string }> };

// Product screens need the store, not the vendor's KYC details (assistants can view products).
const vendorSummary = {
  select: {
    id: true,
    storeName: true,
    market: true,
    taxRegNo: true,
    kycStatus: true,
    restriction: true,
  },
} as const;

async function loadProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      videos: { orderBy: { sortOrder: "asc" } },
      variants: true,
      category: { include: { attributeDefs: true } },
      vendor: vendorSummary,
      salesPerson: {
        include: { user: { select: { name: true, email: true } } },
      },
      approvedBy: { select: { name: true, email: true } },
    },
  });
  return product && (await withInheritedAttributes([product]))[0];
}

export async function GET(_req: Request, { params }: Params) {
  const authz = await requirePermission("products:view");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const product = await loadProduct(id);
  if (!product)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ product });
}

export async function PATCH(req: Request, { params }: Params) {
  const authz = await requirePermission("products:edit");
  if (!authz.ok) return authz.response;
  const { session } = authz;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const existing = await prisma.product.findUnique({
    where: { id },
    include: { vendor: { select: { market: true, taxRegNo: true } } },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const market = existing.vendor.market;
  let vendorTaxRegNo = existing.vendor.taxRegNo;
  // Prices are in the vendor's currency, so a product can't move to the other country.
  if (d.vendorId && d.vendorId !== existing.vendorId) {
    const target = await prisma.vendorProfile.findUnique({
      where: { id: d.vendorId },
      select: { market: true, taxRegNo: true },
    });
    if (!target)
      return NextResponse.json({ error: "Unknown vendor" }, { status: 400 });
    if (target.market !== market) {
      return NextResponse.json(
        { error: "Can't move a product to a vendor in another country" },
        { status: 400 },
      );
    }
    vendorTaxRegNo = target.taxRegNo;
  }
  if (d.basePrice !== undefined && !isValidPrice(market, d.basePrice)) {
    return NextResponse.json(
      { error: priceRuleMessage(market) },
      { status: 400 },
    );
  }
  const compareError = compareAtPriceError(
    market,
    d.compareAtPrice === undefined ? (existing.compareAtPrice === null ? null : Number(existing.compareAtPrice)) : d.compareAtPrice,
    d.basePrice ?? Number(existing.basePrice),
  );
  if (compareError) return NextResponse.json({ error: compareError }, { status: 400 });
  if ((d.isHot || d.isPopular) && existing.approvalStatus !== "APPROVED") {
    return NextResponse.json(
      { error: "Only approved products can be marked Trending or Most Popular" },
      { status: 400 },
    );
  }
  const taxError = taxRuleError(market, vendorTaxRegNo, d.salesTaxBps);
  if (taxError) return NextResponse.json({ error: taxError }, { status: 400 });
  if (d.metadata !== undefined || d.categoryId !== undefined) {
    const attrs = await validateAttributes(
      d.categoryId ?? existing.categoryId,
      d.metadata ??
        (existing.metadata as Record<string, unknown> | null) ??
        undefined,
    );
    if (!attrs.ok)
      return NextResponse.json({ error: attrs.error }, { status: 400 });
    d.metadata = attrs.metadata;
  }
  const variants = d.variants
    ? await validateVariants(
        d.categoryId ?? existing.categoryId,
        market,
        d.variants,
      )
    : null;
  if (variants && !variants.ok)
    return NextResponse.json({ error: variants.error }, { status: 400 });

  // Same rule as approval: a product can only be for sale while it's displayed.
  const display = d.displayOnStorefront ?? existing.displayOnStorefront;
  if (d.availableForSale && !display) d.availableForSale = false;
  if (d.displayOnStorefront === false) d.availableForSale = false;

  await prisma.$transaction(async (tx) => {
    if (variants?.ok) await syncProductVariants(tx, id, variants.variants);
    if (d.imageUrls) {
      const colorFor = imageColorFor(
        d.imageColors,
        variants?.ok ? variants.variants : [],
      );
      await tx.productImage.deleteMany({ where: { productId: id } });
      await tx.productImage.createMany({
        data: d.imageUrls.map((url, i) => ({
          productId: id,
          url,
          sortOrder: i,
          color: colorFor(url),
        })),
      });
    }
    if (d.videoUrls) {
      await tx.productVideo.deleteMany({ where: { productId: id } });
      await tx.productVideo.createMany({
        data: d.videoUrls.map((url, i) => ({
          productId: id,
          url,
          sortOrder: i,
        })),
      });
    }
    const data: Record<string, unknown> = {};
    if (d.name !== undefined) data.name = d.name;
    if (d.description !== undefined) data.description = d.description;
    if (d.basePrice !== undefined)
      data.basePrice = new Prisma.Decimal(d.basePrice.toFixed(2));
    if (d.compareAtPrice !== undefined)
      data.compareAtPrice = d.compareAtPrice === null ? null : new Prisma.Decimal(d.compareAtPrice.toFixed(2));
    if (d.showStockCount !== undefined) data.showStockCount = d.showStockCount;
    if (d.salesTaxBps !== undefined) data.salesTaxBps = d.salesTaxBps;
    // With variants, stock is their total (set by syncProductVariants).
    if (d.stock !== undefined && !(variants?.ok && variants.variants.length))
      data.stock = d.stock;
    if (d.categoryId !== undefined) data.categoryId = d.categoryId;
    if (d.vendorId !== undefined) data.vendorId = d.vendorId;
    if (d.sku !== undefined) data.sku = d.sku;
    if (d.featuredPriority !== undefined)
      data.featuredPriority = d.featuredPriority;
    if (d.zoneTags !== undefined) data.zoneTags = d.zoneTags;
    if (d.metadata !== undefined) data.metadata = d.metadata as object;
    if (d.displayOnStorefront !== undefined) {
      data.displayOnStorefront = d.displayOnStorefront;
    }
    if (d.availableForSale !== undefined)
      data.availableForSale = d.availableForSale;
    if (d.isHot !== undefined) data.isHot = d.isHot;
    if (d.isPopular !== undefined) data.isPopular = d.isPopular;
    if (d.unlimitedStock !== undefined) data.unlimitedStock = d.unlimitedStock;
    // Unlimited stock: hold every option at UNLIMITED_STOCK and only ever say "In stock".
    if (d.unlimitedStock ?? existing.unlimitedStock) {
      data.stock = UNLIMITED_STOCK;
      data.showStockCount = false;
      await tx.productVariant.updateMany({ where: { productId: id }, data: { stock: UNLIMITED_STOCK } });
    }
    if (Object.keys(data).length) {
      await tx.product.update({ where: { id }, data: data as object });
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: "PRODUCT_ADMIN_EDIT",
      entity: "Product",
      entityId: id,
      meta: { fields: Object.keys(d) },
    },
  });

  return NextResponse.json({ product: await loadProduct(id) });
}
