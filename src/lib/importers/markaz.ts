import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { inheritedAttributeDefs, syncProductVariants, validateAttributes, validateVariants } from "@/lib/catalog";
import { isValidPrice } from "@/lib/markets";
import { slugify } from "@/lib/slug";
import { saveUpload } from "@/lib/storage";
import { uniqueVendorSlug } from "@/lib/vendor-slug";
import { KycStatus, ProductApprovalStatus, UserRole, VendorRestriction } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

// Imports a Markaz product export (Shopify column layout, .xlsx or parsed CSV rows) into the
// house store. Markaz's prices are PKR, so everything goes to the PK store. Products land in
// "Pending review"; images are copied to our storage; supplier traces are removed.

export const SOURCE = "markaz";
const MARKET = "PK" as const;

/** `compareAt`: the supplier's optional "Variant Compare At Price" (a crossed-out "was" price). */
export type MarkazVariant = { value: string; sku: string; price: number; compareAt?: number };
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
  // Optional: not every supplier file has it.
  const compareCol = col("Variant Compare At Price");
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
      const compareAt = compareCol >= 0 ? Number(r[compareCol]) : NaN;
      p.variants.push({
        value: r[c.optionValue]?.trim() ?? "",
        sku,
        price: Number(r[c.price]),
        ...(Number.isFinite(compareAt) && compareAt > 0 ? { compareAt } : {}),
      });
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

/**
 * Our category for a Markaz product: category slugs in order of preference (see
 * prisma/seed-categories.ts). The first one that exists is used, so optional subcategories the
 * admin added (e.g. Cosmetics › Lipsticks) are used when present.
 */
type Placement = { slugs: string[] };

function genderOf(p: MarkazProduct): "Men" | "Women" | "Kids" | null {
  const text = `${p.tags.join(" ")} ${p.type} ${p.title}`.toLowerCase();
  if (/\b(kids?|baby|child|children)\b/.test(text)) return "Kids";
  if (/\b(women|womens|women's|ladies|girls?|girl's|bridal)\b/.test(text)) return "Women";
  if (/\b(men|mens|men's|gents|boys?)\b/.test(text)) return "Men";
  return null;
}

const place = (...slugs: string[]): Placement => ({ slugs });

/** Ordered rules: the first match wins. Unmatched products are skipped and reported. */
export function placeProduct(p: MarkazProduct): Placement | null {
  const type = p.type.toLowerCase();
  const tags = p.tags.join(" | ").toLowerCase();
  const all = `${type} | ${tags} | ${p.title.toLowerCase()}`;
  const gender = genderOf(p);
  const kidsClothing = () => place(/\bboys?\b/.test(all) ? "kids-baby-boys-clothing" : "kids-baby-girls-clothing");

  if (/heel|shoe|sandal|slipper|sneaker|khussa|chappal|boot/.test(all)) {
    return place(gender === "Men" ? "shoes-men" : gender === "Kids" ? "shoes-kids" : "shoes-women");
  }
  if (/earring|jhumka/.test(all)) return place("jewellery-watches-earrings");
  if (/\brings?\b/.test(type)) return place("jewellery-watches-rings");
  if (/bangle|bracelet|kangan/.test(all)) return place("jewellery-watches-bangles-bracelets");
  if (/necklace|artificial set|jewel/.test(all)) return place("jewellery-watches-necklaces-sets");
  if (/hand ?bag|clutch|purse|tote/.test(all)) return place("bags-accessories-handbags");
  if (/cosmetic|makeup|lipstick|lip gloss|\blip\b|foundation|blush|eye ?shadow|mascara|eyeliner|concealer|beauty/.test(all)) {
    const makeup = "beauty-personal-care-makeup";
    if (/deal|bundle|kit|\bset\b/.test(type)) return place(`${makeup}-makeup-bundle`, makeup);
    if (/lip/.test(all)) return place(`${makeup}-lipsticks`, makeup);
    if (/foundation|concealer|primer/.test(all)) return place(`${makeup}-foundation`, makeup);
    if (/blush/.test(all)) return place(`${makeup}-blush`, makeup);
    if (/eye ?shadow|mascara|eyeliner/.test(all)) return place(`${makeup}-eyeshadow`, makeup);
    if (/deal|bundle|kit|\bset\b/.test(all)) return place(`${makeup}-makeup-bundle`, makeup);
    return place(makeup);
  }
  // Winter and western outerwear ("West" is how Markaz spells vest).
  if (/hoodie|sweat ?shirt|sweater|pullover|jumper|cardigan|jacket|\bcoat\b|puffer|parka|blazer|gilet|\bvest\b|\bwest\b|fleece|windbreaker/.test(all)) {
    if (gender === "Kids") return kidsClothing();
    if (gender === "Men") return place("mens-fashion-waistcoats-jackets");
    return place("womens-fashion-western-wear", "womens-fashion-ready-to-wear");
  }
  if (/stitched|unstitched|sleep ?wear|night|undergarment|bra|saree|suit|kurt|shirt|trouser|dress|lawn|abaya|hijab|dupatta|shawl|clothing/.test(all)) {
    if (gender === "Kids") return kidsClothing();
    if (gender === "Men") {
      if (/unstitched|fabric/.test(all)) return place("mens-fashion-unstitched-fabric");
      if (/kurta/.test(all)) return place("mens-fashion-kurtas");
      if (/trouser|jeans|pant/.test(all)) return place("mens-fashion-trousers-jeans");
      if (/t-?shirt|polo|\bshirt/.test(all) && !/kameez/.test(all)) return place("mens-fashion-shirts-t-shirts");
      return place("mens-fashion-shalwar-kameez");
    }
    if (/night|sleep|lounge/.test(all)) return place("womens-fashion-nightwear");
    if (/abaya|hijab|niqab/.test(all)) return place("womens-fashion-abayas-hijabs");
    if (/dupatta|shawl|stole/.test(all)) return place("womens-fashion-dupattas-shawls");
    if (/bridal|saree|formal|party|wedding/.test(all)) return place("womens-fashion-formal-bridal");
    if (/unstitched/.test(all)) return place("womens-fashion-unstitched");
    return place("womens-fashion-ready-to-wear");
  }
  return null;
}

// --- Options ------------------------------------------------------------------------------

/** Markaz/Shopify size spellings → ours. */
const SIZE_WORDS: Record<string, string> = {
  small: "S",
  medium: "M",
  large: "L",
  "x-large": "XL",
  "extra large": "XL",
  "xx-large": "XXL",
  "2xl": "XXL",
  "xxx-large": "XXXL",
  "3xl": "XXXL",
  "standard size": "Free Size",
  "one size": "Free Size",
  "free size": "Free Size",
  free: "Free Size",
  "all yards": "Free Size",
  "all sizes": "Free Size",
};

/**
 * Supplier size → ours: "X-Large" → "XL", "3XL" / "XXXL" → "XXXL", "XXXXL" → "4XL",
 * "L/175" (height) and "5xl 95-105kg" (weight) → "L" / "5XL", "2.5 Meter" (fabric length) →
 * "Unstitched", "all yards" → "Free Size". Anything else is kept as written ("100cm").
 */
export function normalizeSize(raw: string) {
  let v = raw
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\s*\/\s*\d+.*$/, "") // "L/175", "3XL/190"
    .replace(/\s+\d+(\.\d+)?\s*(kg)?(\s*-\s*\d+(\.\d+)?\s*kg)?\s*$/i, "") // "5xl 95-105kg", "M 47.50 kg-55.00 kg"
    .trim()
    .replace(/\s+/g, " ");
  const known = SIZE_WORDS[v.toLowerCase()];
  if (known) return known;
  if (/^\d+(\.\d+)?\s*(m|meters?|metres?|yards?|yds?|gaz)$/i.test(v)) return "Unstitched";
  const xs = v.match(/^(x+)(s|l)$/i); // XXXXL → 4XL; up to XXXL stays letters
  if (xs && xs[1].length >= 4 && xs[2].toLowerCase() === "l") return `${xs[1].length}XL`;
  const nxl = v.match(/^([2-9])\s*xl$/i);
  if (nxl) return nxl[1] === "2" ? "XXL" : nxl[1] === "3" ? "XXXL" : `${nxl[1]}XL`;
  if (/^(x{0,3}s|m|x{0,3}l)$/i.test(v)) v = v.toUpperCase();
  return v;
}

/** Sizes we recognise after normalising: letter sizes, Free Size, Unstitched, and kids' heights/ages. */
function isRecognisedSize(v: string) {
  return /^(x{0,3}s|m|x{0,3}l|[4-9]xl|free size|unstitched|\d+\s*cm|\d+(-\d+)?\s*(y|yrs?|years?|m|months?))$/i.test(v);
}

/** "Sky blue (white picture)" → "Sky Blue", "160507 black hooded" → "Black Hooded", "Red [Thickened]]" → "Red". */
export function cleanColour(raw: string) {
  const v = raw
    .replace(/\[[^\]]*\]*|\([^)]*\)*|\{[^}]*\}*/g, " ")
    .replace(/[[\](){}]/g, " ")
    .replace(/^\s*\d{3,}\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return v ? titleCase(v.toLowerCase()) : null;
}

/**
 * Reads one supplier option value. Markaz often combines two choices in one column, e.g. option
 * "Size-Color" with values like "M-White" or "3XL-Red [Thickened fleece-lined]".
 */
export function readOption(optionName: string, value: string): { size?: string; color?: string } {
  const isSize = (s: string) => /size|height|age|yard/i.test(s);
  const isColour = (s: string) => /colou?rs?|shades?/i.test(s);
  const kinds = optionName.split(/\s*[-/&]\s*/).filter(Boolean);
  if (kinds.length === 2 && isSize(kinds[0]) && isColour(kinds[1])) {
    // Hyphens can also sit inside the size ("X-Large", "5xl 95-105kg") or the colour ("Off-white"):
    // use the first hyphen whose left side is a size we recognise and whose right side starts
    // with a word; otherwise fall back to the first hyphen.
    const cuts = [...value.matchAll(/-/g)].map((m) => m.index);
    const cut =
      cuts.find((i) => isRecognisedSize(normalizeSize(value.slice(0, i))) && /^\s*[a-z]/i.test(value.slice(i + 1))) ??
      cuts[0] ??
      -1;
    const sizePart = cut < 0 ? value : value.slice(0, cut);
    const colourPart = cut < 0 ? "" : value.slice(cut + 1);
    return { size: normalizeSize(sizePart), color: cleanColour(colourPart) ?? undefined };
  }
  if (isSize(optionName)) return { size: normalizeSize(value) };
  if (isColour(optionName)) return { color: cleanColour(value) ?? undefined };
  return {};
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
          slug: await uniqueVendorSlug(storeName),
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

/** Matches a (normalised) supplier value to one of a list attribute's options, ignoring case. */
function matchOption(value: string, options: string[]) {
  const v = normalizeSize(value);
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
  opts: {
    vendorId: string;
    stockPerItem: number;
    /** false: new products show shoppers "In stock" instead of the quantity. */
    showStockCount?: boolean;
    dryRun?: boolean;
    log?: (msg: string) => void;
    /** Called after each product is created, updated or skipped (for progress). */
    onResult?: (r: ImportResult) => void;
  },
): Promise<ImportResult[]> {
  const log = opts.log ?? (() => {});
  const categories = await prisma.category.findMany({ include: { parent: { select: { name: true } } } });
  const results: ImportResult[] = [];

  for (const p of products) {
    const result = (action: ImportResult["action"], detail: string, productId?: string) => {
      const r = { ref: p.ref, title: p.title, action, detail, productId };
      results.push(r);
      opts.onResult?.(r);
      log(`${action.padEnd(7)} ${p.title} — ${detail}`);
    };

    const place = placeProduct(p);
    const category = place?.slugs.map((slug) => categories.find((c) => c.slug === slug)).find(Boolean);
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
    // The "was" price of the cheapest option, kept only when it's a valid price above it.
    const rawCompare = p.variants.find((v) => v.price === basePrice)?.compareAt;
    const compareAtPrice =
      rawCompare && rawCompare > basePrice && isValidPrice(MARKET, rawCompare) ? rawCompare : null;
    // A single colour named in the description becomes an option, so colour filters find it.
    const colour = facts.color && !/[,/&]| and /i.test(facts.color) ? titleCase(facts.color) : null;

    // Options: the supplier's Size/Color column, when this category offers that choice.
    let variantInput: { options: Record<string, string>; stock: number; price: number | null; sku: string }[] = [];
    let problem: string | null = null;
    const parsed = p.variants.map((v) => ({ v, ...readOption(p.optionName, v.value) }));
    if (sizeDef && parsed.every((x) => x.size)) {
      variantInput = parsed.map(({ v, size: raw, color }) => {
        const size = sizeDef.dataType === "select" ? matchOption(raw!, sizeDef.options) : raw!;
        if (!size) problem = `size "${raw}" (from "${v.value}") isn't one of ${category.name}'s sizes (${sizeDef.options.join(", ")})`;
        const shade = color ?? colour;
        return {
          options: { size: size ?? raw!, ...(colorDef && shade ? { [colorDef.key]: shade } : {}) },
          stock: opts.stockPerItem,
          price: v.price === basePrice ? null : v.price,
          sku: v.sku,
        };
      });
    } else if (colorDef && parsed.every((x) => x.color)) {
      variantInput = parsed.map(({ v, color }) => ({
        options: { [colorDef.key]: color! },
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
    // Supplier options that read the same once normalised ("Unstitched" and "2.5 Meter") are one
    // choice: merge them when the price matches; a different price can't be guessed, so skip.
    const byOptions = new Map<string, (typeof variantInput)[number]>();
    for (const vi of variantInput) {
      const key = JSON.stringify(Object.entries(vi.options).sort());
      const twin = byOptions.get(key);
      if (!twin) byOptions.set(key, vi);
      else if ((twin.price ?? basePrice) !== (vi.price ?? basePrice)) {
        problem ??= `options ${Object.values(vi.options).join(" / ")} appear twice with different prices`;
      }
    }
    variantInput = [...byOptions.values()];
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
      const oldCompare = existing.compareAtPrice === null ? null : Number(existing.compareAtPrice);
      if (oldCompare !== compareAtPrice) changes.push(`was-price ${oldCompare ?? "none"} → ${compareAtPrice ?? "none"}`);
      if (!opts.dryRun) {
        await prisma.$transaction(async (tx) => {
          await tx.product.update({ where: { id: existing.id }, data: {
              basePrice: new Prisma.Decimal(basePrice),
              compareAtPrice: compareAtPrice === null ? null : new Prisma.Decimal(compareAtPrice),
            },
          });
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
      compareAtPrice ? `Rs ${basePrice} (was ${compareAtPrice})` : `Rs ${basePrice}`,
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
          compareAtPrice: compareAtPrice === null ? null : new Prisma.Decimal(compareAtPrice),
          showStockCount: opts.showStockCount ?? true,
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
