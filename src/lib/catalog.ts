import { z } from "zod";
import { prisma } from "@/lib/db";
import { isStoredMediaUrl } from "@/lib/storage";
import { isValidPrice, priceRuleMessage, type MarketCode } from "@/lib/markets";
import { isColorKey, optionsKey, variantLabel } from "@/lib/variants";
import { KycStatus, VendorRestriction } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

/**
 * Vendors whose products can be bought: KYC approved and not suspended from selling.
 * (SUSPEND_PAYOUTS still sells — it only blocks withdrawals.)
 */
export const sellableVendorWhere = {
  kycStatus: KycStatus.APPROVED,
  restriction: { in: [VendorRestriction.NONE, VendorRestriction.SUSPEND_PAYOUTS] },
} satisfies Prisma.VendorProfileWhereInput;

/** Products shoppers can see and buy in a market. */
export function storefrontProductWhere(market: MarketCode) {
  return {
    approvalStatus: "APPROVED",
    displayOnStorefront: true,
    availableForSale: true,
    vendor: { ...sellableVendorWhere, market },
  } satisfies Prisma.ProductWhereInput;
}

/** A product image/video: media uploaded here, or an external https URL. */
export const mediaUrlSchema = z
  .string()
  .refine((u) => isStoredMediaUrl(u) || /^https:\/\/[^\s]+$/.test(u), "Must be an uploaded file or https URL");

export const ATTRIBUTE_TYPES = ["text", "number", "boolean", "select"] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

/** Older rows used "string" for text. */
export function attributeType(dataType: string): AttributeType {
  return (ATTRIBUTE_TYPES as readonly string[]).includes(dataType) ? (dataType as AttributeType) : "text";
}

type AttributeDefRow = Prisma.CategoryAttributeGetPayload<object>;
type CategoryNode = { id: string; parentId: string | null; attributeDefs: AttributeDefRow[] };

/**
 * A category's fields including those inherited from its parents (Shoes › Women gets Size and
 * Color from Shoes). The closest definition of a key wins; parents' fields come first.
 * Works on an in-memory list of categories; guards against cycles.
 */
export function mergeInheritedAttributes(categoryId: string, all: Map<string, CategoryNode>) {
  const chain: CategoryNode[] = [];
  const seen = new Set<string>();
  for (let c = all.get(categoryId); c && !seen.has(c.id); c = c.parentId ? all.get(c.parentId) : undefined) {
    seen.add(c.id);
    chain.unshift(c);
  }
  const byKey = new Map<string, AttributeDefRow>();
  for (const c of chain) for (const d of c.attributeDefs) byKey.set(d.key, d);
  return [...byKey.values()];
}

/** Inherited + own fields of one category (see mergeInheritedAttributes). */
export async function inheritedAttributeDefs(categoryId: string) {
  const all = await prisma.category.findMany({ include: { attributeDefs: true } });
  return mergeInheritedAttributes(categoryId, new Map(all.map((c) => [c.id, c])));
}

/** Ids of a category and all categories under it (for "Shoes" listings to include Shoes › Women). */
export function categoryAndDescendantIds(categoryId: string, all: { id: string; parentId: string | null }[]) {
  const ids = new Set([categoryId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

/**
 * Checks a product's category-specific fields (stored in Product.metadata) against the
 * category's attribute definitions: required ones present, values of the right type,
 * select values among the options. Keys not defined by the category are kept as-is.
 * Variant attributes are checked by validateVariants instead.
 */
export async function validateAttributes(
  categoryId: string,
  metadata: Record<string, unknown> | undefined,
): Promise<{ ok: true; metadata: Record<string, unknown> } | { ok: false; error: string }> {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return { ok: false, error: "Unknown category" };
  const out: Record<string, unknown> = { ...(metadata ?? {}) };
  for (const def of await inheritedAttributeDefs(categoryId)) {
    // Variant attributes (Size, Color…) live on the product's variants, not in metadata.
    if (def.isVariant) {
      delete out[def.key];
      continue;
    }
    const raw = out[def.key];
    const empty = raw === undefined || raw === null || raw === "";
    if (empty) {
      if (def.required) return { ok: false, error: `${def.name} is required for ${category.name}` };
      delete out[def.key];
      continue;
    }
    switch (attributeType(def.dataType)) {
      case "number": {
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n)) return { ok: false, error: `${def.name} must be a number` };
        out[def.key] = n;
        break;
      }
      case "boolean":
        if (typeof raw !== "boolean" && raw !== "true" && raw !== "false") {
          return { ok: false, error: `${def.name} must be yes or no` };
        }
        out[def.key] = raw === true || raw === "true";
        break;
      case "select":
        if (!def.options.includes(String(raw))) {
          return { ok: false, error: `${def.name} must be one of: ${def.options.join(", ")}` };
        }
        out[def.key] = String(raw);
        break;
      default:
        out[def.key] = String(raw).trim();
    }
  }
  return { ok: true, metadata: out };
}

export const variantsInputSchema = z
  .array(
    z.object({
      options: z.record(z.string(), z.string().trim().min(1).max(40)),
      stock: z.number().int().min(0).max(1_000_000),
      price: z.number().positive().nullable().optional(),
      sku: z.string().trim().max(64).optional(),
    }),
  )
  .max(300);
export type VariantsInput = z.infer<typeof variantsInputSchema>;

/** Photo URL → colour it shows. Colours not offered by the product are dropped. */
export const imageColorsSchema = z.record(z.string(), z.string().trim().max(40));

export type ValidVariant = {
  options: Record<string, string>;
  optionsKey: string;
  stock: number;
  price: Prisma.Decimal | null;
  sku: string | null;
};

/**
 * Checks variants against the category's variant attributes: every variant uses the same
 * attributes, including all required ones; list values are among the options; prices follow
 * the market's rules; no duplicate combinations. A category with a required variant
 * attribute (e.g. Size for Shoes) needs at least one variant.
 */
export async function validateVariants(
  categoryId: string,
  market: MarketCode,
  input: VariantsInput,
): Promise<{ ok: true; variants: ValidVariant[] } | { ok: false; error: string }> {
  const defs = (await inheritedAttributeDefs(categoryId)).filter((d) => d.isVariant);
  const byKey = new Map(defs.map((d) => [d.key, d]));
  if (!input.length) {
    const required = defs.find((d) => d.required);
    return required ? { ok: false, error: `Add at least one ${required.name}` } : { ok: true, variants: [] };
  }
  const axes = Object.keys(input[0].options).sort().join(",");
  const seen = new Set<string>();
  const out: ValidVariant[] = [];
  for (const v of input) {
    if (Object.keys(v.options).sort().join(",") !== axes) {
      return { ok: false, error: "Every variant must have the same options" };
    }
    for (const [key, value] of Object.entries(v.options)) {
      const def = byKey.get(key);
      if (!def) return { ok: false, error: `"${key}" isn't a choosable option for this category` };
      const type = attributeType(def.dataType);
      if (type === "select" && !def.options.includes(value)) {
        return { ok: false, error: `${def.name} must be one of: ${def.options.join(", ")}` };
      }
      if (type === "number" && !Number.isFinite(Number(value))) {
        return { ok: false, error: `${def.name} must be a number` };
      }
    }
    for (const def of defs) {
      if (def.required && !(def.key in v.options)) return { ok: false, error: `Choose at least one ${def.name}` };
    }
    const key = optionsKey(v.options);
    if (seen.has(key)) return { ok: false, error: `Duplicate variant: ${variantLabel(v.options)}` };
    seen.add(key);
    if (v.price != null && !isValidPrice(market, v.price)) return { ok: false, error: priceRuleMessage(market) };
    out.push({
      options: v.options,
      optionsKey: key,
      stock: v.stock,
      price: v.price != null ? new Prisma.Decimal(v.price.toFixed(2)) : null,
      sku: v.sku || null,
    });
  }
  return { ok: true, variants: out };
}

/**
 * Makes the product's variants match `variants`: keeps ids of unchanged combinations (so
 * carts stay valid), removes the rest, and sets Product.stock to their total.
 */
export async function syncProductVariants(tx: Prisma.TransactionClient, productId: string, variants: ValidVariant[]) {
  await tx.productVariant.deleteMany({
    where: { productId, optionsKey: { notIn: variants.map((v) => v.optionsKey) } },
  });
  for (const v of variants) {
    await tx.productVariant.upsert({
      where: { productId_optionsKey: { productId, optionsKey: v.optionsKey } },
      create: { productId, ...v },
      update: { options: v.options, stock: v.stock, price: v.price, sku: v.sku },
    });
  }
  if (variants.length) {
    await tx.product.update({
      where: { id: productId },
      data: { stock: variants.reduce((s, v) => s + v.stock, 0) },
    });
  }
}

/** Colour tag for each image URL, limited to colours the variants offer. */
export function imageColorFor(
  imageColors: Record<string, string> | undefined,
  variants: ValidVariant[],
): (url: string) => string | null {
  const colorKey = Object.keys(variants[0]?.options ?? {}).find(isColorKey);
  const offered = new Set(colorKey ? variants.map((v) => v.options[colorKey]) : []);
  return (url) => {
    const c = imageColors?.[url];
    return c && offered.has(c) ? c : null;
  };
}

/** Loads all categories once; returns key → display name of each category's (inherited) fields. */
export async function attributeNameLookup() {
  const all = await prisma.category.findMany({ include: { attributeDefs: true } });
  const byId = new Map(all.map((c) => [c.id, c]));
  return (categoryId: string) =>
    Object.fromEntries(mergeInheritedAttributes(categoryId, byId).map((d) => [d.key, d.name])) as Record<string, string>;
}

/** Replaces `category.attributeDefs` on loaded products with the inherited set. */
export async function withInheritedAttributes<T extends { categoryId: string; category: { attributeDefs: unknown[] } }>(
  products: T[],
): Promise<T[]> {
  if (!products.length) return products;
  const all = await prisma.category.findMany({ include: { attributeDefs: true } });
  const byId = new Map(all.map((c) => [c.id, c]));
  return products.map((p) => ({
    ...p,
    category: { ...p.category, attributeDefs: mergeInheritedAttributes(p.categoryId, byId) },
  }));
}
