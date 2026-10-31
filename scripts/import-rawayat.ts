// Imports rawayat.com.pk (Shopify, artificial jewellery) as the store "rawayat.com.pk", shown to
// shoppers as "Rawla". Re-runnable: new products are added, prices and stock are refreshed, and
// products the supplier no longer lists are taken off sale.
//
//   npx tsx scripts/import-rawayat.ts [--dry-run] [--limit=N] [--no-scan]
//
// The supplier's name never reaches shoppers: titles and descriptions are our own (their text
// names their box), colours of one design are grouped into one product, and every photo is checked
// with Claude (scripts/brand-scan.ts) for their logo, which is painted out or the photo dropped.
// That needs the Anthropic key from Admin › Settings › AI. With --no-scan (testing), products are
// created hidden instead.
import "dotenv/config";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/slug";
import { saveUpload } from "../src/lib/storage";
import { integrationSettings } from "../src/lib/integration-settings";
import { uniqueVendorSlug } from "../src/lib/vendor-slug";
import { syncProductVariants, UNLIMITED_STOCK, validateVariants } from "../src/lib/catalog";
import { coverMarks } from "./cover-marks";
import { scanForBranding } from "./brand-scan";
import { Prisma } from "../src/generated/prisma/client";
import { KycStatus, ProductApprovalStatus, UserRole, VendorRestriction } from "../src/generated/prisma/enums";

const SITE = "https://rawayat.com.pk";
const SOURCE = "rawayat";
const STORE_NAME = "rawayat.com.pk";
const STORE_EMAIL = "rawayat-store@marketplace.internal";
const STORE_PHONE = "+923154137647";
const PUBLIC_NAME = "Rawla";
const BRAND_NAMES = ["Rawayat", "روایت", "Rawayat Jewellery", "rawayat.com.pk"];
const MAX_IMAGES = 6;
const CONCURRENCY = 4;

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}`));
const DRY = !!arg("dry-run");
const NO_SCAN = !!arg("no-scan");
const LIMIT = Number(arg("limit=")?.split("=")[1] ?? 0);
/** Testing: read saved feed pages (p1.json, p2.json, …) from this folder instead of the site. */
const FEED_DIR = arg("feed-dir=")?.split("=").slice(1).join("=");

type ShopifyVariant = { id: number; title: string; option1: string | null; option2: string | null; option3: string | null; price: string; compare_at_price: string | null; available: boolean };
type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  product_type: string;
  tags: string[];
  options: { name: string; position: number; values: string[] }[];
  variants: ShopifyVariant[];
  images: { src: string; width: number; height: number }[];
};

// ---------------------------------------------------------------------------------------------
// Categories

/** Our category for a product, from their product type first, then the title. Null: not imported. */
function categoryFor(type: string, title: string): string | null {
  const pick = (s: string): string | null => {
    if (/stationery|face ?mask|gift ?box|gift ?wrap|organi[sz]er|wrapin|sunglass/.test(s)) return null;
    if (/watch pendant/.test(s)) return "jewellery-watches-pendants-chains";
    if (/watch/.test(s)) return /\bmen'?s\b|gents/.test(s) ? "jewellery-watches-mens-watches" : "jewellery-watches-womens-watches";
    if (/belt|kamarband/.test(s)) return "bags-accessories-belts";
    if (/clutch|\bbag|purse|pouch/.test(s)) return "bags-accessories-handbags";
    if (/nail|beauty/.test(s)) return "beauty-personal-care-makeup";
    if (/hair|pon(y|i)|scrunch|claw|catcher|\bclips?\b|\bbow\b|hairband|hair ?ties/.test(s)) return "jewellery-watches-hair-accessories";
    if (/bindiya ?kanta|kanta/.test(s)) return "jewellery-watches-earrings-bindiya-kanta";
    if (/jhoomer|passa/.test(s)) return "jewellery-watches-jhoomer";
    if (/matha ?patti|mathapatti|tikka/.test(s)) return "jewellery-watches-matha-patti";
    if (/\bnath\b|nose/.test(s)) return "jewellery-watches-nose-rings";
    if (/bindiya/.test(s)) return "jewellery-watches-bindiya";
    if (/anklet|payal|pazaib/.test(s)) return "jewellery-watches-anklets";
    if (/jhum/.test(s)) return "jewellery-watches-earrings-jhumka";
    if (/\bbali|baliyan|hoop/.test(s)) return "jewellery-watches-earrings-bali-hoops";
    if (/stud|\btops\b/.test(s)) return "jewellery-watches-earrings-studs";
    if (/earring/.test(s)) return "jewellery-watches-earrings";
    if (/locket/.test(s)) return "jewellery-watches-locket-sets";
    if (/pend[ae]nt|chain/.test(s)) return "jewellery-watches-pendants-chains";
    if (/choker/.test(s)) return "jewellery-watches-choker-sets";
    if (/\bmala\b|haar|dora set/.test(s)) return "jewellery-watches-mala-sets";
    if (/bridal set/.test(s)) return "jewellery-watches-bridal-sets";
    if (/necklace|pearl set|short set/.test(s)) return "jewellery-watches-necklaces";
    if (/bundle|jewel(le)?ry set/.test(s)) return "jewellery-watches-necklaces-sets";
    if (/\bkara|karay|\bkada/.test(s)) return "jewellery-watches-kara";
    if (/bangle|churi|kangan/.test(s)) return "jewellery-watches-bangles";
    if (/bracelet/.test(s)) return "jewellery-watches-bracelets";
    if (/\brings?\b/.test(s)) return "jewellery-watches-rings";
    if (/\bset\b|\bduo\b|\btrio\b/.test(s)) return "jewellery-watches-necklaces-sets";
    return null;
  };
  const t = type.trim().toLowerCase();
  const n = title.toLowerCase();
  // Generic types ("Accessories", "Jewellery") say nothing; the title decides.
  const fromType = t && !/^(accessories|jewel(le)?ry|-)$/.test(t) ? pick(t) : undefined;
  return fromType !== undefined && fromType !== null ? fromType : pick(n);
}

// ---------------------------------------------------------------------------------------------
// Names, colours, sizes

const titleCase = (s: string) =>
  s.replace(/\w[\w']*/g, (w) => (w.length <= 2 && /^(of|in|&|an|a|on|to)$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()));

const COLOUR_WORDS =
  /\b(gold(en)?|silver|rose ?gold|rosegold|black|white|off ?white|red|maroon|pink|blue|navy|green|mint|ferozi|turquoise|purple|lilac|multi|champagne|pearl|ruby|emerald|brown|grey|gray|yellow|orange|peach|copper|bronze|beige|cream|clear|transparent|skin|nude|magenta|teal)\b/i;

/** "Rawayat Ladies Watch-27 (Golden)" → base "Ladies Watch", code "27", colour "Golden". */
function parseTitle(raw: string) {
  let t = raw.replace(/rawayat|روایت/gi, " ").replace(/\s+/g, " ").trim();
  // A trailing "(…)" is the colour when it names one; otherwise ("Pack of 2") it stays in the name.
  const bracket = t.match(/\(([^()]+)\)\s*$/)?.[1]?.trim() ?? null;
  const colour = bracket && COLOUR_WORDS.test(bracket) ? bracket : null;
  if (colour) t = t.replace(/\(([^()]+)\)\s*$/, "").trim();
  const code = t.match(/[-–\s]+(\d{1,4}[a-z]?)$/i)?.[1] ?? null;
  if (code) t = t.slice(0, t.length - t.match(/[-–\s]+(\d{1,4}[a-z]?)$/i)![0].length).trim();
  t = t.replace(/[-–\s]+$/, "").replace(/\bpendent/gi, "Pendant");
  if (t === t.toUpperCase() || t === t.toLowerCase()) t = titleCase(t);
  return { base: t, code, colour: colour ? titleCase(colour.replace(/\s*\/\s*/g, " / ")) : null };
}

const RING: Record<string, string> = { "16": "16 (Extra Small)", "17": "17 (Small)", "18": "18 (Medium)", "19": "19 (Large)", "20": "20 (Extra Large)" };
const BANGLE: Record<string, string> = { "4": "2.4 (Small)", "6": "2.6 (Medium)", "8": "2.8 (Large)", "10": "2.10 (Extra Large)" };

/** Their size labels ("2.6 (Sawa 2) Medium", "18 (Medium)", "Adjustable") in one consistent form. */
function normalSize(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (/adjust|free|standard/i.test(s)) return "Adjustable";
  const bangle = s.match(/^2\.(10|4|6|8)\b/);
  if (bangle) return BANGLE[bangle[1]];
  const ring = s.match(/^(1[6-9]|20)\b/);
  if (ring) return RING[ring[1]];
  return titleCase(s);
}

// ---------------------------------------------------------------------------------------------
// Descriptions (our own words; their text names their packaging)

const CATEGORY_LINE: Record<string, string> = {
  "jewellery-watches-rings": "a ring that adds sparkle to everyday outfits and parties alike",
  "jewellery-watches-earrings": "earrings that go with eastern and western outfits",
  "jewellery-watches-earrings-studs": "studs that are light enough to wear all day",
  "jewellery-watches-earrings-jhumka": "jhumkas for weddings, Eid and festive outfits",
  "jewellery-watches-earrings-bali-hoops": "bali earrings for everyday wear and occasions",
  "jewellery-watches-earrings-bindiya-kanta": "kanta earrings with a hair chain for a bridal or formal look",
  "jewellery-watches-locket-sets": "a locket set for gifting or everyday wear",
  "jewellery-watches-pendants-chains": "a pendant that can be worn every day or gifted",
  "jewellery-watches-choker-sets": "a choker set to complete formal and wedding outfits",
  "jewellery-watches-mala-sets": "a mala set for weddings and formal occasions",
  "jewellery-watches-bridal-sets": "a bridal set for barat, walima or mehndi",
  "jewellery-watches-necklaces": "a necklace for parties, dinners and festive wear",
  "jewellery-watches-necklaces-sets": "a jewellery set that makes an easy gift",
  "jewellery-watches-kara": "a kara pair that suits both casual and formal outfits",
  "jewellery-watches-bangles": "bangles to match your outfits for Eid, weddings and every day",
  "jewellery-watches-bracelets": "a bracelet for everyday style or gifting",
  "jewellery-watches-anklets": "an anklet that adds a delicate touch to any outfit",
  "jewellery-watches-jhoomer": "a jhoomer to finish a bridal or festive hairstyle",
  "jewellery-watches-matha-patti": "a matha patti for brides and festive looks",
  "jewellery-watches-bindiya": "a bindiya for weddings and festive outfits",
  "jewellery-watches-nose-rings": "a nath for brides and festive looks",
  "jewellery-watches-hair-accessories": "a hair accessory that is quick to put on and holds well",
  "jewellery-watches-womens-watches": "a watch that works as both timepiece and jewellery",
  "jewellery-watches-mens-watches": "a watch for everyday wear",
  "bags-accessories-handbags": "a bag for weddings, parties and evenings out",
  "bags-accessories-belts": "a belt to dress up kurtas, frocks and abayas",
  "beauty-personal-care-makeup": "a beauty accessory for your everyday routine",
};

/** Materials and finishes we can tell from the title and tags. */
function materials(p: ShopifyProduct) {
  const s = `${p.title} ${p.tags.join(" ")} ${p.product_type}`.toLowerCase();
  const out: string[] = [];
  if (/stainless/.test(s)) out.push("Stainless steel");
  if (/titanium/.test(s)) out.push("Titanium steel");
  if (/zircon|\bad\b|american diamond/.test(s)) out.push("Zircon stones");
  if (/pearl|moti/.test(s)) out.push("Pearls (artificial)");
  if (/kundan/.test(s)) out.push("Kundan work");
  if (/oxidi[sz]ed/.test(s)) out.push("Oxidised finish");
  if (/meena|meenakari/.test(s)) out.push("Meenakari colour work");
  if (/anti ?tarnish/.test(s)) out.push("Anti-tarnish coating");
  if (/turkish/.test(s)) out.push("Turkish-style design");
  if (/madrasi/.test(s)) out.push("Madrasi-style design");
  if (/resin/.test(s)) out.push("Resin");
  return out;
}

function describe(name: string, categorySlug: string, p: ShopifyProduct, colours: string[], sizes: string[]) {
  const mats = materials(p);
  const line = CATEGORY_LINE[categorySlug] ?? "an accessory for everyday wear and occasions";
  const isJewellery = categorySlug.startsWith("jewellery-watches") && !/watches|hair/.test(categorySlug);
  const features = [
    ...mats,
    colours.length > 1 ? `Available in ${colours.length} colours: ${colours.join(", ")}` : colours[0] ? `Colour: ${colours[0]}` : null,
    sizes.length ? (sizes.length === 1 && sizes[0] === "Adjustable" ? "Adjustable size" : `Sizes: ${sizes.join(", ")}`) : null,
    isJewellery ? "Artificial (fashion) jewellery" : null,
    "Colours can look slightly different on screens",
  ].filter(Boolean);
  const care = isJewellery
    ? "Put jewellery on after perfume, creams and hairspray, and take it off before washing or bathing. Wipe with a soft, dry cloth after wearing and store it in a closed box or pouch, away from moisture."
    : "Keep dry and wipe clean with a soft cloth. Store away from moisture and direct sunlight.";
  return [
    `${name}: ${line}.`,
    `## Features\n\n${features.map((f) => `- ${f}`).join("\n")}`,
    ...(sizes.length > 1 && /rings/.test(categorySlug) ? ["## Size\n\nRing sizes go from 16 (Extra Small) to 20 (Extra Large). If you're not sure of your size, choose Adjustable where it's offered."] : []),
    ...(sizes.length > 1 && /bangles|kara/.test(categorySlug)
      ? ["## Size\n\nBangle sizes follow the usual Pakistani sizing: 2.4 (Small), 2.6 (Medium), 2.8 (Large) and 2.10 (Extra Large)."]
      : []),
    `## Care\n\n${care}`,
    `## Delivery\n\nSold by ${PUBLIC_NAME} on DukanWalley. Delivered across Pakistan with cash on delivery.`,
  ].join("\n\n");
}

// ---------------------------------------------------------------------------------------------
// Store, photos

async function ensureStore() {
  const existing = await prisma.vendorProfile.findFirst({ where: { user: { email: STORE_EMAIL } } });
  if (existing || DRY) return existing;
  const user = await prisma.user.create({
    data: {
      email: STORE_EMAIL,
      name: STORE_NAME,
      role: UserRole.VENDOR,
      vendorProfile: {
        create: {
          storeName: STORE_NAME,
          displayName: PUBLIC_NAME,
          slug: await uniqueVendorSlug(PUBLIC_NAME),
          phone: STORE_PHONE,
          addressLine1: "-",
          city: "Lahore",
          market: "PK",
          kycStatus: KycStatus.APPROVED,
          restriction: VendorRestriction.NONE,
          verificationNotes: `Supplier: ${SITE} (Rawayat Jewellery, Lahore). WhatsApp ${STORE_PHONE}. Created for the first import on ${new Date().toISOString().slice(0, 10)}.`,
        },
      },
    },
    include: { vendorProfile: true },
  });
  console.log(`created store "${STORE_NAME}" (shown as "${PUBLIC_NAME}")`);
  return user.vendorProfile!;
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Buffer> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    if (attempts <= 1) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return fetchWithRetry(url, attempts - 1);
  }
}

const stats = { photos: 0, cleaned: 0, dropped: 0, failed: 0 };

/** Downloads one photo, removes the supplier's branding and saves it. Null: photo not usable. */
async function importPhoto(src: string, apiKey: string | null): Promise<string | null> {
  const url = `${src}${src.includes("?") ? "&" : "?"}width=1400`;
  let data = await fetchWithRetry(url);
  if (apiKey) {
    let scan;
    for (let i = 0; i < 3 && !scan; i++) {
      try {
        scan = await scanForBranding(data, { apiKey, brandNames: BRAND_NAMES });
      } catch (e) {
        if (i === 2) throw e;
        await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
      }
    }
    if (scan!.skip) {
      stats.dropped += 1;
      return null;
    }
    if (scan!.areas.length) {
      data = await coverMarks(data, scan!.areas);
      stats.cleaned += 1;
    }
  }
  stats.photos += 1;
  return (await saveUpload(new Blob([new Uint8Array(data)]).stream(), "image")).url;
}

/** Runs tasks with a few at a time. */
async function pool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

// ---------------------------------------------------------------------------------------------

async function fetchFeed(): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  if (FEED_DIR) {
    const { readFileSync, readdirSync } = await import("fs");
    for (const f of readdirSync(FEED_DIR).filter((x) => /^p\d+\.json$/.test(x))) all.push(...JSON.parse(readFileSync(`${FEED_DIR}/${f}`, "utf8")).products);
    return all;
  }
  for (let page = 1; page <= 200; page++) {
    let res: Response | null = null;
    // Shopify rate-limits busy clients (429): wait and try again, politely.
    for (let attempt = 0; attempt < 6; attempt++) {
      res = await fetch(`${SITE}/products.json?limit=250&page=${page}`, { headers: { "user-agent": "Mozilla/5.0 (DukanWalley catalogue import)" } });
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
    }
    if (!res!.ok) throw new Error(`feed page ${page}: HTTP ${res!.status}`);
    const { products } = (await res!.json()) as { products: ShopifyProduct[] };
    if (!products.length) break;
    all.push(...products);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return all;
}

type Group = { key: string; base: string; code: string | null; type: string; products: ShopifyProduct[] };

/** One design in several colours is several Shopify products: group them into one of ours. */
function groupDesigns(feed: ShopifyProduct[]) {
  const groups = new Map<string, Group>();
  for (const p of feed) {
    const { base, code } = parseTitle(p.title);
    const key = `${slugify(base)}-${code ?? p.handle}`;
    const g = groups.get(key) ?? { key, base, code, type: p.product_type, products: [] };
    g.products.push(p);
    groups.set(key, g);
  }
  return [...groups.values()];
}

async function main() {
  const settings = await integrationSettings();
  const apiKey = NO_SCAN ? null : (settings.ANTHROPIC_API_KEY ?? null);
  if (!apiKey && !NO_SCAN && !DRY) {
    throw new Error("Add the Anthropic API key in Admin › Settings › AI first (photos must be checked for the supplier's logo), or run with --no-scan to create hidden test products.");
  }

  const feed = await fetchFeed();
  let groups = groupDesigns(feed);
  console.log(`${feed.length} products in the feed → ${groups.length} designs${DRY ? " (dry run)" : ""}`);
  if (LIMIT) groups = groups.slice(0, LIMIT);

  const store = await ensureStore();
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c]));
  const counts = { created: 0, updated: 0, skipped: 0, removed: 0 };
  const skippedTypes = new Map<string, number>();
  const seen = new Set<string>();

  await pool(groups, CONCURRENCY, async (g) => {
    const categorySlug = categoryFor(g.type, g.base);
    const category = categorySlug ? categories.get(categorySlug) : undefined;
    if (!category) {
      counts.skipped += 1;
      const k = `${g.type || "(none)"} / ${g.base}`.slice(0, 60);
      skippedTypes.set(k, (skippedTypes.get(k) ?? 0) + 1);
      return;
    }
    seen.add(g.key);

    // Variants: colour (one per Shopify product) × size (their option).
    const lines = g.products.flatMap((p) => {
      const { colour } = parseTitle(p.title);
      const sizeIdx = p.options.find((o) => /size/i.test(o.name))?.position;
      return p.variants.map((v) => ({
        colour,
        size: normalSize(sizeIdx ? (v as Record<string, unknown>)[`option${sizeIdx}`] as string : null),
        price: Math.round(Number(v.price)),
        was: Math.round(Number(v.compare_at_price ?? 0)),
        available: v.available,
      }));
    });
    const colours = [...new Set(lines.map((l) => l.colour).filter(Boolean))] as string[];
    const sizes = [...new Set(lines.map((l) => l.size).filter(Boolean))] as string[];
    const price = Math.min(...lines.map((l) => l.price));
    const was = Math.max(...lines.filter((l) => l.price === price).map((l) => l.was));
    const compareAtPrice = was > price ? new Prisma.Decimal(was) : null;
    const anyAvailable = lines.some((l) => l.available);
    // Choices only when there is something to choose (a single "Adjustable" is in the description).
    const useVariants = colours.length > 1 || sizes.length > 1;
    const name = `${g.base}${!useVariants && colours[0] ? ` (${colours[0]})` : ""}${g.code ? ` – Design ${g.code}` : ""}`;

    const variantInput = useVariants
      ? [
          ...new Map(
            lines.map((l) => {
              // Every variant needs the same options: fill a gap (a colour sold without sizes).
              const options: Record<string, string> = {};
              if (colours.length > 1) options.color = l.colour ?? "As shown";
              if (sizes.length > 1) options.size = l.size ?? "Standard";
              return [JSON.stringify(options), { options, stock: l.available ? UNLIMITED_STOCK : 0, price: l.price === price ? null : l.price }];
            }),
          ).values(),
        ]
      : [];

    const existing = await prisma.product.findUnique({ where: { source_sourceRef: { source: SOURCE, sourceRef: g.key } } });
    if (existing) {
      if (!DRY) {
        await prisma.$transaction(async (tx) => {
          await tx.product.update({
            where: { id: existing.id },
            data: { basePrice: new Prisma.Decimal(price), compareAtPrice, availableForSale: anyAvailable, unlimitedStock: true, stock: anyAvailable ? UNLIMITED_STOCK : 0 },
          });
          if (useVariants) {
            const v = await validateVariants(category.id, "PK", variantInput);
            if (v.ok) await syncProductVariants(tx, existing.id, v.variants);
          }
        });
      }
      counts.updated += 1;
      return;
    }

    const variants = useVariants ? await validateVariants(category.id, "PK", variantInput) : null;
    if (variants && !variants.ok) {
      console.log(`skipped ${name}: ${variants.error}`);
      counts.skipped += 1;
      return;
    }
    const sources = [...new Set(g.products.flatMap((p) => p.images.map((i) => i.src)))].slice(0, MAX_IMAGES);
    if (DRY) {
      if (counts.created < 15) console.log(`\n=== ${name} | ${categorySlug} | Rs ${price}${compareAtPrice ? ` (was ${was})` : ""} | ${colours.join(", ") || "-"} | ${sizes.join(", ") || "-"} | ${sources.length} photos\n${describe(name, categorySlug!, g.products[0], colours, sizes)}`);
      counts.created += 1;
      return;
    }

    const imageUrls: string[] = [];
    for (const src of sources) {
      try {
        const url = await importPhoto(src, apiKey);
        if (url) imageUrls.push(url);
      } catch (e) {
        stats.failed += 1;
        console.log(`  photo failed (${(e as Error).message}): ${src.split("?")[0]}`);
      }
    }
    if (!imageUrls.length) {
      console.log(`skipped ${name}: no usable photo`);
      counts.skipped += 1;
      return;
    }
    const mats = materials(g.products[0]);
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug: `${slugify(name)}-${randomBytes(3).toString("hex")}`,
          name,
          description: describe(name, categorySlug!, g.products[0], colours, sizes),
          basePrice: new Prisma.Decimal(price),
          compareAtPrice,
          stock: anyAvailable ? UNLIMITED_STOCK : 0,
          showStockCount: false,
          unlimitedStock: true,
          categoryId: category.id,
          vendorId: store!.id,
          approvalStatus: ProductApprovalStatus.APPROVED,
          approvedAt: new Date(),
          // Photos not checked for the supplier's logo stay off the shop.
          displayOnStorefront: !!apiKey,
          availableForSale: anyAvailable,
          metadata: { ...(mats.length ? { material: mats.join(", ") } : {}), ...(!useVariants && colours[0] ? { color: colours[0] } : {}), photosChecked: !!apiKey },
          source: SOURCE,
          sourceRef: g.key,
          images: { create: imageUrls.map((url, i) => ({ url, sortOrder: i })) },
        },
      });
      if (variants?.ok && variants.variants.length) await syncProductVariants(tx, product.id, variants.variants);
    });
    counts.created += 1;
    if (counts.created % 50 === 0) console.log(`… ${counts.created} created (${stats.photos} photos, ${stats.cleaned} cleaned, ${stats.dropped} dropped)`);
  });

  // Designs the supplier no longer lists: off sale (kept for order history).
  if (!DRY && !LIMIT) {
    const gone = await prisma.product.updateMany({
      where: { source: SOURCE, sourceRef: { notIn: [...seen] }, availableForSale: true },
      data: { availableForSale: false },
    });
    counts.removed = gone.count;
  }

  console.log(`\ndone: ${JSON.stringify(counts)} · photos ${JSON.stringify(stats)}`);
  if (skippedTypes.size) {
    console.log("not imported (no matching category):");
    for (const [k, n] of [...skippedTypes].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${n} × ${k}`);
  }
}

main().finally(() => prisma.$disconnect());
