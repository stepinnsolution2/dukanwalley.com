import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  imageColorFor,
  imageColorsSchema,
  mediaUrlSchema,
  sellableVendorWhere,
  syncProductVariants,
  withInheritedAttributes,
  validateAttributes,
  validateVariants,
  variantsInputSchema,
} from "@/lib/catalog";
import { slugify } from "@/lib/slug";
import { isValidPrice, priceRuleMessage, taxRuleError } from "@/lib/markets";
import { ProductApprovalStatus } from "@/generated/prisma/enums";
import { randomBytes } from "crypto";

// Sales staff need the store, not the vendor's KYC details.
const vendorSummary = {
  select: { id: true, storeName: true, market: true },
} as const;

const MAX_IMAGES = 12;
const MAX_VIDEOS = 5;

const createSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  basePrice: z.number().positive(),
  salesTaxBps: z.number().int().min(0).max(10000).optional(),
  stock: z.number().int().min(0).optional(),
  categoryId: z.string(),
  vendorId: z.string(),
  zoneTags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  imageUrls: z
    .array(mediaUrlSchema)
    .min(1, "Add at least one image")
    .max(MAX_IMAGES),
  videoUrls: z.array(mediaUrlSchema).max(MAX_VIDEOS).optional(),
  variants: variantsInputSchema.optional(),
  imageColors: imageColorsSchema.optional(),
});

const patchSchema = z.object({
  id: z.string(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  basePrice: z.number().positive().optional(),
  salesTaxBps: z.number().int().min(0).max(10000).optional(),
  stock: z.number().int().min(0).optional(),
  categoryId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  imageUrls: z
    .array(mediaUrlSchema)
    .min(1, "Keep at least one image")
    .max(MAX_IMAGES)
    .optional(),
  videoUrls: z.array(mediaUrlSchema).max(MAX_VIDEOS).optional(),
  variants: variantsInputSchema.optional(),
  imageColors: imageColorsSchema.optional(),
});

async function salesProfile() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SALES") return null;
  return prisma.salesProfile.findUnique({ where: { userId: session.user.id } });
}

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const badRequest = (error: string) =>
  NextResponse.json({ error }, { status: 400 });

/** The salesperson's own products; `?id=` returns one with full details for editing. */
export async function GET(req: Request) {
  const profile = await salesProfile();
  if (!profile) return unauthorized();
  const include = {
    images: { orderBy: { sortOrder: "asc" } },
    videos: { orderBy: { sortOrder: "asc" } },
    variants: true,
    category: { include: { attributeDefs: true } },
    vendor: vendorSummary,
  } as const;

  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const product = await prisma.product.findFirst({
      where: { id, salesPersonId: profile.id },
      include,
    });
    if (!product)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ product: (await withInheritedAttributes([product]))[0] });
  }
  const products = await prisma.product.findMany({
    where: { salesPersonId: profile.id },
    include,
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ products: await withInheritedAttributes(products) });
}

export async function POST(req: Request) {
  const profile = await salesProfile();
  if (!profile) return unauthorized();

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  const vendor = await prisma.vendorProfile.findFirst({
    where: { id: d.vendorId, ...sellableVendorWhere },
  });
  if (!vendor) return badRequest("Vendor cannot receive listings");
  if (!isValidPrice(vendor.market, d.basePrice))
    return badRequest(priceRuleMessage(vendor.market));
  const taxError = taxRuleError(vendor.market, vendor.taxRegNo, d.salesTaxBps);
  if (taxError) return badRequest(taxError);
  const attrs = await validateAttributes(d.categoryId, d.metadata);
  if (!attrs.ok) return badRequest(attrs.error);
  const variants = await validateVariants(
    d.categoryId,
    vendor.market,
    d.variants ?? [],
  );
  if (!variants.ok) return badRequest(variants.error);
  const colorFor = imageColorFor(d.imageColors, variants.variants);

  const slug = `${slugify(d.name)}-${randomBytes(3).toString("hex")}`;
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        slug,
        name: d.name,
        description: d.description,
        basePrice: d.basePrice,
        salesTaxBps: d.salesTaxBps ?? 0,
        stock: d.stock ?? 0,
        categoryId: d.categoryId,
        vendorId: d.vendorId,
        salesPersonId: profile.id,
        approvalStatus: ProductApprovalStatus.PENDING_REVIEW,
        displayOnStorefront: false,
        availableForSale: false,
        zoneTags: d.zoneTags ?? [],
        metadata: attrs.metadata as object,
        images: {
          create: d.imageUrls.map((url, i) => ({
            url,
            sortOrder: i,
            color: colorFor(url),
          })),
        },
        videos: {
          create: (d.videoUrls ?? []).map((url, i) => ({ url, sortOrder: i })),
        },
      },
    });
    await syncProductVariants(tx, created.id, variants.variants);
    return tx.product.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        images: true,
        videos: true,
        variants: true,
        category: true,
        vendor: vendorSummary,
      },
    });
  });

  return NextResponse.json({ product });
}

/** Edit a pending or rejected listing (e.g. fix media after a rejection); it goes back to review. */
export async function PATCH(req: Request) {
  const profile = await salesProfile();
  if (!profile) return unauthorized();

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const existing = await prisma.product.findFirst({
    where: { id: d.id, salesPersonId: profile.id },
    include: { vendor: { select: { market: true, taxRegNo: true } } },
  });
  if (!existing)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.approvalStatus === "APPROVED") {
    return badRequest(
      "Approved products are locked for sales; ask admin to unpublish.",
    );
  }
  if (
    d.basePrice !== undefined &&
    !isValidPrice(existing.vendor.market, d.basePrice)
  ) {
    return badRequest(priceRuleMessage(existing.vendor.market));
  }
  const taxError = taxRuleError(
    existing.vendor.market,
    existing.vendor.taxRegNo,
    d.salesTaxBps,
  );
  if (taxError) return badRequest(taxError);
  const attrs = await validateAttributes(
    d.categoryId ?? existing.categoryId,
    d.metadata ??
      (existing.metadata as Record<string, unknown> | null) ??
      undefined,
  );
  if (!attrs.ok) return badRequest(attrs.error);
  const variants = d.variants
    ? await validateVariants(
        d.categoryId ?? existing.categoryId,
        existing.vendor.market,
        d.variants,
      )
    : null;
  if (variants && !variants.ok) return badRequest(variants.error);

  await prisma.$transaction(async (tx) => {
    if (variants?.ok) await syncProductVariants(tx, d.id, variants.variants);
    if (d.imageUrls) {
      const colorFor = imageColorFor(
        d.imageColors,
        variants?.ok ? variants.variants : [],
      );
      await tx.productImage.deleteMany({ where: { productId: d.id } });
      await tx.productImage.createMany({
        data: d.imageUrls.map((url, i) => ({
          productId: d.id,
          url,
          sortOrder: i,
          color: colorFor(url),
        })),
      });
    }
    if (d.videoUrls) {
      await tx.productVideo.deleteMany({ where: { productId: d.id } });
      await tx.productVideo.createMany({
        data: d.videoUrls.map((url, i) => ({
          productId: d.id,
          url,
          sortOrder: i,
        })),
      });
    }
    await tx.product.update({
      where: { id: d.id },
      data: {
        name: d.name,
        description: d.description,
        basePrice: d.basePrice,
        salesTaxBps: d.salesTaxBps,
        // With variants, stock is their total (set by syncProductVariants).
        stock: variants?.ok && variants.variants.length ? undefined : d.stock,
        categoryId: d.categoryId,
        metadata: attrs.metadata as object,
        approvalStatus: ProductApprovalStatus.PENDING_REVIEW,
        rejectionReason: null,
      },
    });
  });

  const product = await prisma.product.findUnique({
    where: { id: d.id },
    include: {
      images: true,
      videos: true,
      variants: true,
      category: true,
      vendor: vendorSummary,
    },
  });
  return NextResponse.json({ product });
}
