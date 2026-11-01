// Imports every in-stock product from borjan.com.pk (Shopify: shoes, bags, wallets, belts, socks,
// scarves, cufflinks, fragrances, shoe care, kids' toys) as the store "borjan.com.pk", shown to
// shoppers as "Borjaan", with a 15% commission. Re-runnable: new items are added, prices and sizes
// in stock refreshed, and items no longer in stock go off sale.
//
//   [VENDOR_PASSWORD=…] npx tsx scripts/import-borjan.ts [--dry-run] [--feed-dir=DIR] [--limit=N]
import "dotenv/config";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/slug";
import { saveUpload } from "../src/lib/storage";
import { hashPassword } from "../src/lib/password";
import { uniqueVendorSlug } from "../src/lib/vendor-slug";
import { syncProductVariants, UNLIMITED_STOCK, validateVariants } from "../src/lib/catalog";
import { Prisma } from "../src/generated/prisma/client";
import { KycStatus, ProductApprovalStatus, UserRole, VendorRestriction } from "../src/generated/prisma/enums";

const SITE = "https://www.borjan.com.pk";
const SOURCE = "borjan";
const STORE_NAME = "borjan.com.pk";
const STORE_EMAIL = "borjan-store@marketplace.internal";
const STORE_USERNAME = "borjan";
const STORE_PHONE = "+923451111126";
const SUPPLIER_EMAIL = "customercare@borjan.com.pk";
const PUBLIC_NAME = "Borjaan";
const COMMISSION_BPS = 1500;
/** Photos per colour, and per product in all. */
const PHOTOS_PER_COLOUR = 4;
const MAX_PHOTOS = 10;
const CONCURRENCY = 4;

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}`));
const DRY = !!arg("dry-run");
const FEED_DIR = arg("feed-dir=")?.split("=").slice(1).join("=");
const LIMIT = Number(arg("limit=")?.split("=")[1] ?? 0);

type Variant = { option1: string | null; option2: string | null; price: string; compare_at_price: string | null; available: boolean };
type Product = {
  handle: string;
  title: string;
  body_html: string | null;
  product_type: string;
  options: { name: string; position: number }[];
  variants: Variant[];
  images: { src: string }[];
};

async function fetchFeed(): Promise<Product[]> {
  const all: Product[] = [];
  if (FEED_DIR) {
    const fs = await import("fs");
    for (const f of fs.readdirSync(FEED_DIR).filter((x) => /^p\d+\.json$/.test(x))) all.push(...JSON.parse(fs.readFileSync(`${FEED_DIR}/${f}`, "utf8")).products);
    return all;
  }
  for (let page = 1; page <= 100; page++) {
    let res: Response | null = null;
    for (let a = 0; a < 6; a++) {
      res = await fetch(`${SITE}/products.json?limit=250&page=${page}`, { headers: { "user-agent": "Mozilla/5.0 (DukanWalley catalogue import)" } });
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 15_000 * (a + 1)));
    }
    if (!res!.ok) throw new Error(`feed page ${page}: HTTP ${res!.status}`);
    const { products } = (await res!.json()) as { products: Product[] };
    if (!products.length) break;
    all.push(...products);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return all;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s/(-])[a-z]/g, (c) => c.toUpperCase());
const plain = (html: string | null) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

type Placement = { slug: string; style?: string; kind: "shoes" | "socks" | "bag" | "wallet" | "belt" | "scarf" | "cufflinks" | "fragrance" | "beauty" | "care" | "toy" };

/** Our category (and shoe style) from their product type, with the title deciding men/women. */
function place(type: string, title: string): Placement | null {
  const t = type.toLowerCase().trim();
  const n = title.toLowerCase();
  const who = /^(boy|girl|kid)|\b(boys?|girls?|kids)\b/.test(`${t} ${n}`) ? "kids" : /\bwomen\b|^women/.test(n) ? "women" : /\bmen\b|^men/.test(n) ? "men" : /women/.test(t) ? "women" : "men";
  if (/sock/.test(t)) return { slug: "shoes-socks", kind: "socks" };
  if (/polish|cleaner|renovator|shiner|shoe care|magic gel|heel (cushion|protector|sleeve|cup)|gel cushion|toe separator|footbed|happy feet/.test(t)) return { slug: "bags-accessories-shoe-care", kind: "care" };
  if (/perfume|body mist/.test(t)) return { slug: "beauty-personal-care-fragrances", kind: "fragrance" };
  if (/nail paint|facial tint/.test(t)) return { slug: "beauty-personal-care-makeup", kind: "beauty" };
  if (/toy|basket ?ball/.test(t)) return { slug: "kids-baby-toys-games", kind: "toy" };
  if (/cufflink/.test(t)) return { slug: "bags-accessories-cufflinks", kind: "cufflinks" };
  if (/scarf/.test(t)) return { slug: "womens-fashion-dupattas-shawls", kind: "scarf" };
  if (/wallet/.test(t)) return { slug: "bags-accessories-wallets", kind: "wallet" };
  if (/belt/.test(t)) return { slug: "bags-accessories-belts", kind: "belt" };
  if (/laptop bag/.test(t)) return { slug: "computer-accessories-bags-sleeves", kind: "bag" };
  if (/backpack|school bag|outdoor bag/.test(t)) return { slug: "bags-accessories-backpacks", kind: "bag" };
  if (/bag|clutch|pouch/.test(t)) return { slug: "bags-accessories-handbags", kind: "bag" };

  // Footwear.
  const slug = who === "kids" ? "shoes-kids" : who === "women" ? "shoes-women" : "shoes-men";
  const s = `${t} ${n}`;
  const style = /peshawari/.test(s)
    ? "Peshawari & Khussa"
    : /boot/.test(s)
      ? "Boots"
      : /sport shoe|outdoor shoe|jogger|running/.test(s)
        ? "Running & Sports"
        : /sneaker|life ?style/.test(s)
          ? "Sneakers"
          : /heel|court|sling ?back|pump/.test(s)
            ? "Heels"
            : /slipper|sandal|chappal|flip ?flop|crocs|mule|slide/.test(s)
              ? "Sandals & Slippers"
              : /lace ?up|school shoe|oxford|formal/.test(s)
                ? "Formal"
                : /shoe|moccasin|slip ?on|ballerina|loafer/.test(s)
                  ? "Casual"
                  : null;
  return style ? { slug, style, kind: "shoes" } : null;
}

/** "1", "STANDARD", "Free" mean one size: no choice. "100ML" → "100 ml"; "39-42" stays. */
function sizeLabel(raw: string | null): string | null {
  const v = (raw ?? "").trim();
  if (!v || /^(1|standard|free|one size)$/i.test(v)) return null;
  const ml = v.match(/^(\d+)\s*ml$/i);
  if (ml) return `${ml[1]} ml`;
  return v.toUpperCase() === v && /[A-Z]{2,}/.test(v) ? titleCase(v) : v;
}
const sizeOrder = (s: string) => Number(s.match(/\d+/)?.[0] ?? { XS: 1, S: 2, M: 3, L: 4, XL: 5 }[s] ?? 99);

const FOR: Record<Placement["kind"], string> = {
  shoes: "",
  socks: "Comfortable socks for daily wear.",
  bag: "A practical bag with room for your everyday essentials.",
  wallet: "A slim wallet to keep cards and cash organised.",
  belt: "A belt that finishes formal and casual outfits.",
  scarf: "A soft scarf to wear with eastern or western outfits.",
  cufflinks: "Cufflinks for formal shirts, weddings and special occasions; they also make a good gift.",
  fragrance: "A fragrance for daily wear and special occasions.",
  beauty: "A beauty essential for your everyday look.",
  care: "Keeps your shoes looking good and your feet comfortable.",
  toy: "A fun toy for kids to play with indoors and out.",
};
const STYLE_USE: Record<string, string> = {
  Formal: "office, school and formal occasions",
  Casual: "everyday wear",
  Sneakers: "everyday wear, outings and travel",
  "Running & Sports": "walking, gym and sports",
  "Sandals & Slippers": "home, summer and daily wear",
  Heels: "parties, weddings and occasions",
  Boots: "winter and outdoor wear",
  "Peshawari & Khussa": "shalwar kameez, Eid and weddings",
};

/** Features we can read from their description, restated in our own words. */
function features(body: string) {
  const b = body.toLowerCase();
  return [
    /genuine leather|pure leather/.test(b) ? "Genuine leather" : /synthetic leather|faux leather|pu leather|vegan leather/.test(b) ? "Synthetic leather" : null,
    /suede/.test(b) && "Suede finish",
    /knit/.test(b) && "Knitted upper",
    /mesh|breathab/.test(b) && "Breathable",
    /cushion|padded|memory foam|soft insole|comfort/.test(b) && "Cushioned for comfort",
    /lightweight|light-weight/.test(b) && "Lightweight",
    /slip-?on/.test(b) && "Easy slip-on",
    /lace-?up/.test(b) && "Lace-up",
    /buckle/.test(b) && "Buckle detail",
    /strap/.test(b) && "Adjustable strap",
    /non-?slip|anti-?slip|grip|traction/.test(b) && "Good grip",
    /zip/.test(b) && "Zip closure",
    /compartment|pocket/.test(b) && "Several compartments and pockets",
    /water.?(resistant|proof)/.test(b) && "Water-resistant",
    /cotton/.test(b) && "Cotton blend",
    /long.?lasting/.test(b) && "Long-lasting",
  ].filter(Boolean) as string[];
}

function describe(name: string, p: Placement, body: string, colours: string[], sizes: string[]) {
  const first =
    p.kind === "shoes"
      ? `${name}: ${p.style === "Running & Sports" ? "sports shoes" : (p.style ?? "shoes").toLowerCase()} made for ${STYLE_USE[p.style ?? "Casual"]}.`
      : `${name}. ${FOR[p.kind]}`;
  const list = [
    ...features(body),
    colours.length > 1 ? `Available in ${colours.length} colours: ${colours.join(", ")}` : colours[0] ? `Colour: ${colours[0]}` : null,
    sizes.length ? `Sizes in stock: ${sizes.join(", ")}` : null,
  ].filter(Boolean);
  const sizeNote =
    p.kind === "shoes"
      ? "\n\n## Size\n\nSizes are EU shoe sizes. If you're between sizes, choose the larger one."
      : p.kind === "socks"
        ? "\n\n## Size\n\nSock sizes are given as the EU shoe sizes they fit, e.g. 39-42."
        : "";
  return `${first}\n\n## Features\n\n${list.map((x) => `- ${x}`).join("\n")}${sizeNote}\n\n## Delivery\n\nSold by ${PUBLIC_NAME} on DukanWalley. Delivered across Pakistan with cash on delivery.`;
}

async function ensureStore() {
  const existing = await prisma.vendorProfile.findFirst({ where: { user: { email: STORE_EMAIL } } });
  if (existing || DRY) return existing;
  const user = await prisma.user.create({
    data: {
      email: STORE_EMAIL,
      username: STORE_USERNAME,
      passwordHash: process.env.VENDOR_PASSWORD ? await hashPassword(process.env.VENDOR_PASSWORD) : null,
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
          commissionOverrideBps: COMMISSION_BPS,
          verificationNotes: `Supplier: ${SITE} (Borjan, Lahore). WhatsApp +92 345 1111126, email ${SUPPLIER_EMAIL}. Commission 15%. Created ${new Date().toISOString().slice(0, 10)}.`,
        },
      },
    },
    include: { vendorProfile: true },
  });
  console.log(`created store "${STORE_NAME}" (shown as "${PUBLIC_NAME}", login ${STORE_USERNAME})`);
  return user.vendorProfile!;
}

async function download(src: string, attempts = 3): Promise<string> {
  try {
    const res = await fetch(`${src.split("?")[0]}?width=1400`, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await saveUpload(new Blob([new Uint8Array(await res.arrayBuffer())]).stream(), "image")).url;
  } catch (e) {
    if (attempts <= 1) throw e;
    await new Promise((r) => setTimeout(r, 2000));
    return download(src, attempts - 1);
  }
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) await fn(items[next++]); }));
}

async function main() {
  const feed = (await fetchFeed()).filter((p) => p.variants.some((v) => v.available));
  // Colours of one article are separate listings: "bm7651-grey-black-men-sneakers".
  const groups = new Map<string, Product[]>();
  for (const p of feed) {
    const code = p.handle.match(/^([a-z]{1,4}\d{2,6}[a-z]?)/)?.[1] ?? p.handle;
    groups.set(code, [...(groups.get(code) ?? []), p]);
  }
  let entries = [...groups.entries()];
  if (LIMIT) entries = entries.slice(0, LIMIT);
  console.log(`${feed.length} in-stock listings → ${groups.size} products${DRY ? " (dry run)" : ""}`);
  const store = await ensureStore();
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c]));
  const counts = { created: 0, updated: 0, skipped: 0, offSale: 0, photos: 0 };
  const skippedTypes = new Map<string, number>();
  const seen: string[] = [];

  await pool(entries, CONCURRENCY, async ([code, listings]) => {
    const first = listings[0];
    const baseTitle = first.title.replace(/-[^-]*$/, "").replace(/\s+/g, " ").trim() || first.title;
    const placement = place(first.product_type, baseTitle);
    const category = placement ? categories.get(placement.slug) : undefined;
    if (!placement || !category) {
      skippedTypes.set(first.product_type || "(none)", (skippedTypes.get(first.product_type || "(none)") ?? 0) + 1);
      counts.skipped += 1;
      return;
    }
    seen.push(code);
    const colourIdx = first.options.find((o) => /colou?r/i.test(o.name))?.position ?? 1;
    const sizeIdx = first.options.find((o) => /size/i.test(o.name))?.position ?? 2;
    const opt = (v: Variant, i: number) => (i === 1 ? v.option1 : v.option2);
    const lines = listings.flatMap((p) =>
      p.variants.map((v) => ({
        colour: titleCase((opt(v, colourIdx) ?? "").trim()) || null,
        size: sizeLabel(opt(v, sizeIdx)),
        price: Math.round(Number(v.price)),
        was: Math.round(Number(v.compare_at_price ?? 0)),
        available: v.available,
      })),
    );
    const colours = [...new Set(lines.map((l) => l.colour).filter(Boolean))] as string[];
    const allSizes = [...new Set(lines.map((l) => l.size).filter(Boolean))] as string[];
    const inStockSizes = [...new Set(lines.filter((l) => l.available && l.size).map((l) => l.size!))].sort((a, b) => sizeOrder(a) - sizeOrder(b));
    const price = Math.min(...lines.filter((l) => l.available).map((l) => l.price));
    const was = Math.max(...lines.filter((l) => l.price === price).map((l) => l.was));
    const compareAtPrice = was > price ? new Prisma.Decimal(was) : null;
    const designNo = code.match(/\d+/)?.[0];
    const name = `${titleCase(baseTitle)}${colours.length === 1 ? ` – ${colours[0]}` : ""}${designNo ? ` (Design ${designNo})` : ""}`;
    // Shoes and socks always show their size; other items only when there is a real choice.
    const sized = placement.kind === "shoes" || placement.kind === "socks" ? allSizes.length > 0 : allSizes.length > 1;
    const variantInput =
      colours.length > 1 || sized || placement.kind === "scarf"
        ? [
            ...new Map(
              lines.map((l) => {
                const options: Record<string, string> = {};
                if (sized) options.size = l.size ?? "Standard";
                // Women's fashion requires a size: scarves are one size.
                if (placement.kind === "scarf") options.size = "Free Size";
                if (colours.length > 1 && l.colour) options.color = l.colour;
                return [JSON.stringify(options), { options, stock: l.available ? UNLIMITED_STOCK : 0, price: l.price === price ? null : l.price }];
              }),
            ).values(),
          ]
        : [];
    // Shoes must have a size; one-size footwear (rare) gets "Standard".
    const input = placement.kind === "shoes" && !variantInput.length ? [{ options: { size: "Standard" }, stock: UNLIMITED_STOCK, price: null }] : variantInput;
    const variants = input.length ? await validateVariants(category.id, "PK", input) : ({ ok: true as const, variants: [] });
    if (!variants.ok) {
      console.log(`skipped ${name}: ${variants.error}`);
      counts.skipped += 1;
      return;
    }

    const existing = await prisma.product.findUnique({ where: { source_sourceRef: { source: SOURCE, sourceRef: code } } });
    if (existing) {
      if (!DRY) {
        await prisma.$transaction(async (tx) => {
          await tx.product.update({ where: { id: existing.id }, data: { basePrice: new Prisma.Decimal(price), compareAtPrice, availableForSale: true, stock: UNLIMITED_STOCK } });
          if (variants.variants.length) await syncProductVariants(tx, existing.id, variants.variants);
        });
      }
      counts.updated += 1;
      return;
    }

    const description = describe(titleCase(baseTitle), placement, plain(first.body_html), colours, inStockSizes);
    const sources = listings
      .flatMap((p) => p.images.slice(0, PHOTOS_PER_COLOUR).map((i) => i.src))
      .filter((s, i, a) => a.indexOf(s) === i)
      .slice(0, MAX_PHOTOS);
    if (DRY) {
      if (counts.created < 5) console.log(`\n=== ${name} | ${placement.slug}${placement.style ? ` | ${placement.style}` : ""} | Rs ${price}${compareAtPrice ? ` (was ${was})` : ""} | ${colours.join(", ")} | ${inStockSizes.join(", ")} | ${sources.length} photos\n${description}`);
      counts.created += 1;
      return;
    }
    const imageUrls: string[] = [];
    for (const src of sources) {
      try {
        imageUrls.push(await download(src));
      } catch (e) {
        console.log(`  photo failed (${(e as Error).message}): ${src.split("?")[0]}`);
      }
    }
    if (!imageUrls.length) {
      console.log(`skipped ${name}: no photo could be downloaded`);
      counts.skipped += 1;
      return;
    }
    counts.photos += imageUrls.length;
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug: `${slugify(name)}-${randomBytes(3).toString("hex")}`,
          name,
          description,
          basePrice: new Prisma.Decimal(price),
          compareAtPrice,
          stock: UNLIMITED_STOCK,
          showStockCount: false,
          unlimitedStock: true,
          categoryId: category.id,
          vendorId: store!.id,
          approvalStatus: ProductApprovalStatus.APPROVED,
          approvedAt: new Date(),
          displayOnStorefront: true,
          availableForSale: true,
          metadata: { ...(placement.style ? { style: placement.style } : {}), ...(colours.length === 1 ? { color: colours[0] } : {}) },
          source: SOURCE,
          sourceRef: code,
          images: { create: imageUrls.map((url, i) => ({ url, sortOrder: i })) },
        },
      });
      if (variants.variants.length) await syncProductVariants(tx, product.id, variants.variants);
    });
    counts.created += 1;
    if (counts.created % 100 === 0) console.log(`… ${counts.created} created (${counts.photos} photos)`);
  });

  if (!DRY && !LIMIT) {
    const gone = await prisma.product.updateMany({ where: { source: SOURCE, sourceRef: { notIn: seen }, availableForSale: true }, data: { availableForSale: false } });
    counts.offSale = gone.count;
  }
  console.log(`\ndone: ${JSON.stringify(counts)}`);
  if (skippedTypes.size) console.log("not imported (no category):", [...skippedTypes].map(([k, n]) => `${n} × ${k}`).join(", "));
}

main().finally(() => prisma.$disconnect());
