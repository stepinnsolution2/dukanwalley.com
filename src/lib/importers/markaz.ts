import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { inheritedAttributeDefs, syncProductVariants, validateAttributes, validateVariants } from "@/lib/catalog";
import { isValidPrice } from "@/lib/markets";
import { slugify } from "@/lib/slug";
import { saveUpload } from "@/lib/storage";
import { KycStatus, ProductApprovalStatus, UserRole, VendorRestriction } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

// Imports a Markaz product export (Shopify column layout, .xlsx or parsed CSV rows) into the
// house store. Markaz's prices are PKR, so everything goes to the PK store. Products land in
// "Pending review"; images are copied to our storage; supplier traces are removed.

export const SOURCE = "markaz";
const MARKET = "PK" as const;

export type MarkazVariant = { value: string; sku: string; price: number };
export type MarkazProduct = {
  /** Markaz product id, from the SKU "MKZ-{productId}-{variantId}". */
  ref: string;
  title: string;
  html: string;
  type: string;
  tags: string[];
  optionName: string;
  variants: MarkazVariant[];
  imageUrls: string[];
};

/** Groups Shopify-layout rows (one row per variant or extra image) into products. */
export function parseShopifyRows(rows: string[][]): MarkazProduct[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const c = {
    handle: col("Handle"),
    title: col("Title"),
    body: col("Body (HTML)"),
    type: col("Type"),
    tags: col("Tags"),
    optionName: col("Option1 Name"),
    optionValue: col("Option1 Value"),
    sku: col("Variant SKU"),
    price: col("Variant Price"),
    image: col("Image Src"),
  };
  for (const [k, i] of Object.entries(c)) {
    if (i < 0) throw new Error(`Missing column for ${k}: is this a Markaz "Shopify" export?`);
  }

  const byHandle = new Map<string, MarkazProduct>();
  for (const r of body) {
    const handle = r[c.handle]?.trim();
    if (!handle) continue;
    let p = byHandle.get(handle);
    if (!p) {
      p = { ref: "", title: "", html: "", type: "", tags: [], optionName: "", variants: [], imageUrls: [] };
      byHandle.set(handle, p);
    }
    // The first row of a product carries its details; later rows add variants and images.
    if (r[c.title]?.trim()) {
      p.title = r[c.title].trim();
      p.html = r[c.body] ?? "";
      p.type = r[c.type]?.trim() ?? "";
      p.tags = (r[c.tags] ?? "").split(",").map((t) => t.trim()).filter(Boolean);
      p.optionName = r[c.optionName]?.trim() ?? "";
    }
    const sku = r[c.sku]?.trim();
    if (sku) {
      p.variants.push({ value: r[c.optionValue]?.trim() ?? "", sku, price: Number(r[c.price]) });
      p.ref ||= sku.match(/^MKZ-(\d+)-/)?.[1] ?? "";
    }
    const img = r[c.image]?.trim();
    if (img && !p.imageUrls.includes(img)) p.imageUrls.push(img);
  }
  for (const [handle, p] of byHandle) p.ref ||= handle.match(/mkz-(\d+)$/)?.[1] ?? handle;
  return [...byHandle.values()].filter((p) => p.title);
}

/** Markaz stamps its product code on photos named "...-withcode.jpg". */
export const isWatermarked = (url: string) => /-withcode\.[a-z]+(\?|$)/i.test(url);

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** Lines that would point customers at the supplier, or that the import replaces. */
const DROP_LINE = [
  /markaz/i,
  /^product code\s*:/i,
  /^available sizes\s*:/i, // the size picker shows what's actually in stock
  /^size chart\s*:/i,
  /^delivered across pakistan/i,
];

/**
 * Supplier HTML → plain text for our product page, plus "Key: Value" facts (Color, Fabric…).
 * Bullets become "• ", duplicates and supplier references are removed.
 */
export function cleanDescription(html: string): { text: string; facts: Record<string, string> } {
  const blocks = html
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, "") // links (Markaz's "view this product")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(p|li|div|h\d)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((l) => decodeEntities(l).replace(/\s+/g, " ").trim())
    .map((l) => l.replace(/^-\s+/, "• "))
    .filter((l) => l && l !== "•");

  const facts: Record<string, string> = {};
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const line of blocks) {
    const bare = line.replace(/^•\s*/, "");
    if (DROP_LINE.some((re) => re.test(bare))) continue;
    const key = bare.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const fact = bare.match(/^([A-Za-z ]{2,30}):\s*(.+)$/);
    if (fact) facts[fact[1].trim().toLowerCase()] ??= fact[2].trim();
    kept.push(line);
  }
  // Consecutive bullets stay together; other blocks are separated by a blank line.
  const text = kept
    .map((l, i) => (i && !(l.startsWith("•") && kept[i - 1].startsWith("•")) ? `\n${l}` : l))
    .join("\n")
    .trim();
  return { text, facts };
}

// --- Categories ---------------------------------------------------------------------------

/** Our category for a Markaz product, by slug (see prisma/seed-categories.ts). */
type Placement = { slug: string };

function genderOf(p: MarkazProduct): "Men" | "Women" | "Kids" | null {
  const text = `${p.tags.join(" ")} ${p.type} ${p.title}`.toLowerCase();
  if (/(kids?|baby|child|children)/.test(text)) return "Kids";
  if (/(women|womens|women's|ladies|girls?|girl's|bridal)/.test(text)) return "Women";
  if (/(men|mens|men's|gents|boys?)/.test(text)) return "Men";
  return null;
}

/** Ordered rules: the first match wins. Unmatched products are skipped and reported. */
export function placeProduct(p: MarkazProduct): Placement | null {
  const type = p.type.toLowerCase();
  const tags = p.tags.join(" | ").toLowerCase();
  const all = `${type} | ${tags} | ${p.title.toLowerCase()}`;
  const gender = genderOf(p);

  if (/heel|shoe|sandal|slipper|sneaker|khussa|chappal|boot/.test(all)) {
    return { slug: gender === "Men" ? "shoes-men" : gender === "Kids" ? "shoes-kids" : "shoes-women" };
  }
  if (/earring|jhumka/.test(all)) return { slug: "jewellery-watches-earrings" };
  if (/rings?/.test(type)) return { slug: "jewellery-watches-rings" };
  if (/bangle|bracelet|kangan/.test(all)) return { slug: "jewellery-watches-bangles-bracelets" };
  if (/necklace|artificial set|jewel/.test(all)) return { slug: "jewellery-watches-necklaces-sets" };
  if (/hand ?bag|clutch|purse|tote/.test(all)) return { slug: "bags-accessories-handbags" };
  if (/cosmetic|makeup|lipstick|foundation|beauty/.test(all)) return { slug: "beauty-personal-care-makeup" };
  if (/stitched|unstitched|sleep ?wear|night|undergarment|bra|saree|suit|kurt|shirt|trouser|dress|lawn|abaya|hijab|dupatta|shawl/.test(all)) {
    if (gender === "Kids") {
      return /boys?/.test(all) ? { slug: "kids-baby-boys-clothing" } : { slug: "kids-baby-girls-clothing" };
    }
    if (gender === "Men") {
      if (/unstitched|fabric/.test(all)) return { slug: "mens-fashion-unstitched-fabric" };
      if (/kurta/.test(all)) return { slug: "mens-fashion-kurtas" };
      if (/trouser|jeans|pant/.test(all)) return { slug: "mens-fashion-trousers-jeans" };
      if (/t-?shirt|polo|shirt/.test(all) && !/kameez/.test(all)) return { slug: "mens-fashion-shirts-t-shirts" };
      return { slug: "mens-fashion-shalwar-kameez" };
    }
    if (/night|sleep|lounge/.test(all)) return { slug: "womens-fashion-nightwear" };
    if (/abaya|hijab|niqab/.test(all)) return { slug: "womens-fashion-abayas-hijabs" };
    if (/dupatta|shawl|stole/.test(all)) return { slug: "womens-fashion-dupattas-shawls" };
    if (/bridal|saree|formal|party|wedding/.test(all)) return { slug: "womens-fashion-formal-bridal" };
    if (/unstitched/.test(all)) return { slug: "womens-fashion-unstitched" };
    return { slug: "womens-fashion-ready-to-wear" };
  }
  return null;
}

// --- House store --------------------------------------------------------------------------

const HOUSE_EMAIL = "house-store@marketplace.internal";

/** The store imported products are sold under (created on first use; it can't sign in). */
export async function ensureHouseStore(storeName: string) {
  const existing = await prisma.vendorProfile.findFirst({ where: { user: { email: HOUSE_EMAIL } } });
  if (existing) return existing;
  const user = await prisma.user.create({
    data: {
      email: HOUSE_EMAIL,
      name: storeName,
      role: UserRole.VENDOR,
      vendorProfile: {
        create: {
          storeName,
          phone: "-",
          addressLine1: "Head office",
          market: MARKET,
          kycStatus: KycStatus.APPROVED,
          restriction: VendorRestriction.NONE,
          verificationNotes: "House store for products imported from suppliers.",
        },
      },
    },
    include: { vendorProfile: true },
  });
  return user.vendorProfile!;
}

// --- Import -------------------------------------------------------------------------------

export type ImportResult = {
  ref: string;
  title: string;
  action: "created" | "updated" | "skipped";
  detail: string;
  productId?: string;
};

const SIZE_ALIASES: Record<string, string> = { "standard size": "Free Size", "one size": "Free Size" };

/** Matches a supplier value to one of a list attribute's options, ignoring case. */
function matchOption(value: string, options: string[]) {
  const v = SIZE_ALIASES[value.toLowerCase()] ?? value;
  return options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? null;
}

const titleCase = (s: string) => s.replace(/\b\w/g, (ch) => ch.toUpperCase());

/** Copies a supplier image to our storage, retrying network errors (not "not found"). */
async function downloadImage(url: string, attempts = 3): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok || !res.body) throw Object.assign(new Error(`HTTP ${res.status}`), { final: res.status < 500 });
    return (await saveUpload(res.body, "image")).url;
  } catch (e) {
    if (attempts <= 1 || (e as { final?: boolean }).final) throw e;
    return downloadImage(url, attempts - 1);
  }
}

/**
 * Creates (or, when already imported, re-prices) each product under `vendorId`.
 * With `dryRun`, checks everything but writes nothing and downloads nothing.
 */
export async function importMarkazProducts(
  products: MarkazProduct[],
  opts: { vendorId: string; stockPerItem: number; dryRun?: boolean; log?: (msg: string) => void },
): Promise<ImportResult[]> {
  const log = opts.log ?? (() => {});
  const categories = await prisma.category.findMany({ include: { parent: { select: { name: true } } } });
  const results: ImportResult[] = [];

  for (const p of products) {
    const result = (action: ImportResult["action"], detail: string, productId?: string) => {
      results.push({ ref: p.ref, title: p.title, action, detail, productId });
      log(`${action.padEnd(7)} ${p.title} — ${detail}`);
    };

    const place = placeProduct(p);
    const category = place ? categories.find((c) => c.slug === place.slug) : undefined;
    if (!place || !category) {
      result("skipped", `no category for Markaz type "${p.type}" (tags: ${p.tags.join(", ")})`);
      continue;
    }
    if (!p.variants.length || p.variants.some((v) => !Number.isFinite(v.price) || v.price <= 0)) {
      result("skipped", "missing or invalid price");
      continue;
    }
    if (p.variants.some((v) => !isValidPrice(MARKET, v.price))) {
      result("skipped", "price isn't a whole number of rupees");
      continue;
    }

    const { text: description, facts } = cleanDescription(p.html);
    const defs = await inheritedAttributeDefs(category.id);
    const sizeDef = defs.find((d) => d.isVariant && d.key === "size");
    const colorDef = defs.find((d) => d.isVariant && /^colou?r$/.test(d.key));
    const basePrice = Math.min(...p.variants.map((v) => v.price));
    // A single colour named in the description becomes an option, so colour filters find it.
    const colour = facts.color && !/[,/&]| and /i.test(facts.color) ? titleCase(facts.color) : null;

    // Options: the supplier's Size/Color column, when this category offers that choice.
    let variantInput: { options: Record<string, string>; stock: number; price: number | null; sku: string }[] = [];
    let problem: string | null = null;
    if (sizeDef && /size/i.test(p.optionName)) {
      variantInput = p.variants.map((v) => {
        const size = sizeDef.dataType === "select" ? matchOption(v.value, sizeDef.options) : v.value;
        if (!size) problem = `size "${v.value}" isn't one of ${category.name}'s sizes (${sizeDef.options.join(", ")})`;
        return {
          options: { size: size ?? v.value, ...(colorDef && colour ? { [colorDef.key]: colour } : {}) },
          stock: opts.stockPerItem,
          price: v.price === basePrice ? null : v.price,
          sku: v.sku,
        };
      });
    } else if (colorDef && /colou?r/i.test(p.optionName)) {
      variantInput = p.variants.map((v) => ({
        options: { [colorDef.key]: titleCase(v.value) },
        stock: opts.stockPerItem,
        price: v.price === basePrice ? null : v.price,
        sku: v.sku,
      }));
    } else if (p.variants.length > 1) {
      problem = `${p.variants.length} options (${p.optionName}) but ${category.name} has no matching option field`;
    }
    // A required choice (e.g. garment size) with no supplier column: one "Free Size" option.
    if (!variantInput.length && !problem && sizeDef?.required) {
      const free = sizeDef.dataType === "select" ? matchOption("Free Size", sizeDef.options) : "Free Size";
      if (!free) problem = `${category.name} needs a size and the supplier gives none`;
      else variantInput = [{ options: { size: free }, stock: opts.stockPerItem, price: null, sku: p.variants[0].sku }];
    }
    if (problem) {
      result("skipped", problem);
      continue;
    }
    const variants = await validateVariants(category.id, MARKET, variantInput);
    if (!variants.ok) {
      result("skipped", variants.error);
      continue;
    }

    const metadata: Record<string, unknown> = {};
    const fabric = facts.fabric ?? facts["shirt fabric"];
    if (fabric && defs.some((d) => d.key === "fabric")) metadata.fabric = fabric;
    const attrs = await validateAttributes(category.id, metadata);
    if (!attrs.ok) {
      result("skipped", attrs.error);
      continue;
    }

    // Already imported: refresh prices only, keeping any edits made here.
    const existing = await prisma.product.findUnique({
      where: { source_sourceRef: { source: SOURCE, sourceRef: p.ref } },
      include: { variants: true },
    });
    if (existing) {
      const changes: string[] = [];
      if (Number(existing.basePrice) !== basePrice) changes.push(`price ${existing.basePrice} → ${basePrice}`);
      if (!opts.dryRun) {
        await prisma.$transaction(async (tx) => {
          await tx.product.update({ where: { id: existing.id }, data: { basePrice: new Prisma.Decimal(basePrice) } });
          for (const v of variants.variants) {
            const row = existing.variants.find((x) => x.sku === v.sku);
            if (row) await tx.productVariant.update({ where: { id: row.id }, data: { price: v.price } });
          }
        });
      }
      result("updated", changes.length ? changes.join(", ") : "no price change", existing.id);
      continue;
    }

    const sources = p.imageUrls.filter((u) => !isWatermarked(u));
    const watermarked = p.imageUrls.length - sources.length;
    const summary = [
      `${category.parent ? `${category.parent.name} › ` : ""}${category.name}`,
      `Rs ${basePrice}`,
      variants.variants.length ? `${variants.variants.length} option(s)` : "no options",
      `${sources.length} image(s)${watermarked ? `, ${watermarked} watermarked skipped` : ""}`,
    ].join(" · ");
    if (opts.dryRun) {
      result("created", `(dry run) ${summary}`);
      continue;
    }

    const imageUrls: string[] = [];
    for (const url of sources) {
      try {
        imageUrls.push(await downloadImage(url));
      } catch (e) {
        log(`        image failed (${(e as Error).message}): ${url.split("?")[0]}`);
      }
    }
    if (!imageUrls.length) {
      result("skipped", "no image could be downloaded");
      continue;
    }

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug: `${slugify(p.title)}-${randomBytes(3).toString("hex")}`,
          name: p.title,
          description,
          basePrice: new Prisma.Decimal(basePrice),
          salesTaxBps: 0,
          stock: variants.variants.length ? 0 : opts.stockPerItem,
          sku: variants.variants.length ? null : p.variants[0].sku,
          categoryId: category.id,
          vendorId: opts.vendorId,
          approvalStatus: ProductApprovalStatus.PENDING_REVIEW,
          displayOnStorefront: false,
          availableForSale: false,
          metadata: attrs.metadata as object,
          source: SOURCE,
          sourceRef: p.ref,
          images: { create: imageUrls.map((url, i) => ({ url, sortOrder: i })) },
        },
      });
      await syncProductVariants(tx, product.id, variants.variants);
      return product;
    });
    result("created", summary.replace(/\d+ image\(s\)/, `${imageUrls.length} image(s)`), created.id);
  }
  return results;
}
