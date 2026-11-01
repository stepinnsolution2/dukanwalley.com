// Imports the in-stock shoes from soloto.com (Shopify; brands Calza, Liza, Ndure) as the store
// "soloto.com", shown to shoppers as "SoloShoes", with a 15% commission. Re-runnable: new shoes are
// added, prices and sizes in stock are refreshed, and shoes no longer in stock go off sale.
//
//   VENDOR_PASSWORD=… npx tsx scripts/import-soloto.ts [--dry-run] [--feed-dir=DIR]
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

const SITE = "https://www.soloto.com";
const SOURCE = "soloto";
const STORE_NAME = "soloto.com";
const STORE_EMAIL = "soloto-store@marketplace.internal";
const STORE_USERNAME = "soloto";
const STORE_PHONE = "+924235855566";
const SUPPLIER_EMAIL = "help@soloto.com";
const PUBLIC_NAME = "SoloShoes";
const COMMISSION_BPS = 1500;
const MAX_IMAGES = 6;

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}`));
const DRY = !!arg("dry-run");
const FEED_DIR = arg("feed-dir=")?.split("=").slice(1).join("=");

type Variant = { sku: string; option1: string | null; price: string; compare_at_price: string | null; available: boolean };
type Product = {
  handle: string;
  title: string;
  body_html: string | null;
  product_type: string;
  vendor: string;
  tags: string[];
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

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const plain = (html: string | null) => (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function categoryFor(type: string) {
  const t = type.toLowerCase();
  if (/^mens/.test(t)) return "shoes-men";
  if (/^womens/.test(t)) return "shoes-women";
  if (/boys|girls|kids/.test(t)) return "shoes-kids";
  return null;
}

/** Our Style choice from their tags. */
function styleFor(tags: string[], title: string) {
  // The title decides first ("Girls Lace-Up Sneakers" carries the tag "SNEAKERS BOOTS").
  const t = title.toLowerCase();
  if (/sneaker|trainer/.test(t)) return /sport|running|athletic/.test(t) ? "Running & Sports" : "Sneakers";
  if (/\bboots?\b/.test(t)) return "Boots";
  const s = `${tags.join(" | ")} | ${title}`.toLowerCase();
  if (/peshawari|khussa/.test(s)) return "Peshawari & Khussa";
  if (/\bboots?\b/.test(s) && !/sneaker/.test(s)) return "Boots";
  if (/heel|pump/.test(s)) return "Heels";
  if (/athletic|sports shoes|running/.test(s)) return "Running & Sports";
  if (/sneaker/.test(s)) return "Sneakers";
  if (/chappal|sandal|open shoes|flip|slipper|slide/.test(s)) return "Sandals & Slippers";
  if (/formal|lace-up|dress shoe/.test(s)) return "Formal";
  return "Casual";
}

/** "40/6" → "40 (UK 6)"; kids' "29" stays "29". */
function sizeLabel(raw: string) {
  const m = raw.trim().match(/^(\d{2})\s*\/\s*0?(\d{1,2})$/);
  return m ? `${m[1]} (UK ${m[2]})` : raw.trim();
}
const sizeOrder = (s: string) => Number(s.match(/^\d+/)?.[0] ?? 999);

/** Facts we can read from their description, for our own wording. */
function facts(body: string) {
  const b = body.toLowerCase();
  const material =
    /genuine leather/.test(b) ? "Genuine leather" : /man.?made leather|synthetic leather|faux leather/.test(b) ? "Man-made leather" : /man.?made material/.test(b) ? "Man-made material" : /knit/.test(b) ? "Knitted fabric" : /mesh/.test(b) ? "Mesh" : /suede/.test(b) ? "Suede" : /canvas/.test(b) ? "Canvas" : /pvc|rubber|eva/.test(b) ? "Lightweight synthetic" : null;
  const sole = /\btpr\b/.test(b) ? "TPR outsole" : /\beva\b/.test(b) ? "EVA outsole" : /\bpu\b.*sole|pu out/.test(b) ? "PU outsole" : /pvc/.test(b) ? "PVC outsole" : /rubber/.test(b) ? "Rubber outsole" : null;
  const features = [
    /lace-?up|laces/.test(b) && "Lace-up fastening",
    /slip-?on/.test(b) && "Easy slip-on design",
    /buckle/.test(b) && "Metal buckle detail",
    /velcro|hook (and|&) loop|strap/.test(b) && "Adjustable strap",
    /round toe/.test(b) && "Round toe",
    /pointed toe/.test(b) && "Pointed toe",
    /cushion|padded|soft insole|comfort insole/.test(b) && "Cushioned insole for all-day comfort",
    /lightweight|light weight/.test(b) && "Lightweight",
    /breathab/.test(b) && "Breathable upper",
    /anti.?slip|slip.?resist|grip/.test(b) && "Good grip",
  ].filter(Boolean) as string[];
  return { material, sole, features };
}

function describe(name: string, brand: string, categorySlug: string, style: string, body: string, colours: string[], sizes: string[]) {
  const f = facts(body);
  const who = categorySlug === "shoes-men" ? "men" : categorySlug === "shoes-women" ? "women" : "kids";
  const use: Record<string, string> = {
    Formal: "office, weddings and formal occasions",
    Casual: "everyday wear",
    Sneakers: "everyday wear, outings and travel",
    "Running & Sports": "walking, gym and sports",
    "Sandals & Slippers": "summer, home and daily wear",
    Heels: "parties and occasions",
    Boots: "winter and outdoor wear",
    "Peshawari & Khussa": "shalwar kameez, Eid and weddings",
  };
  const list = [
    f.material ? `Upper: ${f.material.toLowerCase()}` : null,
    f.sole,
    ...f.features,
    colours.length > 1 ? `Available in ${colours.length} colours: ${colours.join(", ")}` : colours[0] ? `Colour: ${colours[0]}` : null,
    sizes.length ? `Sizes in stock: ${sizes.join(", ")}` : null,
  ].filter(Boolean);
  return [
    `${name} by ${brand}: ${style === "Running & Sports" ? "sports shoes" : style.toLowerCase()} for ${who}, made for ${use[style] ?? "everyday wear"}.`,
    `## Features\n\n${list.map((x) => `- ${x}`).join("\n")}`,
    `## Size\n\n${
      categorySlug === "shoes-kids"
        ? "Kids' sizes are EU sizes. Measure your child's foot and leave a little room to grow."
        : "Sizes are EU with the UK size in brackets, e.g. 41 (UK 7). If you're between sizes, choose the larger one."
    }`,
    `## Delivery\n\nSold by ${PUBLIC_NAME} on DukanWalley. Delivered across Pakistan with cash on delivery.`,
  ].join("\n\n");
}

async function ensureStore() {
  const existing = await prisma.vendorProfile.findFirst({ where: { user: { email: STORE_EMAIL } } });
  if (existing || DRY) return existing;
  const user = await prisma.user.create({
    data: {
      email: STORE_EMAIL,
      username: STORE_USERNAME,
      // Login password comes from the environment (never stored in the code); without it the store has no login yet.
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
          verificationNotes: `Supplier: ${SITE} (Soloto, Lahore; brands Calza, Liza, Ndure). Phone 042-35855566, email ${SUPPLIER_EMAIL}. Commission 15%. Created ${new Date().toISOString().slice(0, 10)}.`,
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
    const res = await fetch(`${src.split("?")[0]}?width=1400`, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await saveUpload(new Blob([new Uint8Array(await res.arrayBuffer())]).stream(), "image")).url;
  } catch (e) {
    if (attempts <= 1) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return download(src, attempts - 1);
  }
}

async function main() {
  const feed = (await fetchFeed()).filter((p) => p.variants.some((v) => v.available));
  // One design in several colours = several listings sharing the SKU base ("MX-CS-0005:BLACK:40/6").
  const groups = new Map<string, Product[]>();
  for (const p of feed) {
    const base = p.variants[0]?.sku?.split(":")[0]?.trim() || p.handle;
    groups.set(base, [...(groups.get(base) ?? []), p]);
  }
  console.log(`${feed.length} in-stock listings → ${groups.size} designs${DRY ? " (dry run)" : ""}`);
  const store = await ensureStore();
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c]));
  const counts = { created: 0, updated: 0, skipped: 0, offSale: 0 };
  const seen: string[] = [];

  for (const [code, products] of groups) {
    const first = products[0];
    const categorySlug = categoryFor(first.product_type);
    const category = categorySlug ? categories.get(categorySlug) : undefined;
    if (!category) {
      console.log(`skipped ${first.title}: no category for "${first.product_type}"`);
      counts.skipped += 1;
      continue;
    }
    seen.push(code);
    const brand = titleCase(first.vendor.trim());
    const colourOf = (p: Product) => titleCase((p.variants[0]?.sku?.split(":")[1] ?? "").trim()) || null;
    const lines = products.flatMap((p) =>
      p.variants.map((v) => ({
        colour: colourOf(p),
        size: sizeLabel(v.option1 ?? ""),
        price: Math.round(Number(v.price)),
        was: Math.round(Number(v.compare_at_price ?? 0)),
        available: v.available,
      })),
    );
    const colours = [...new Set(lines.map((l) => l.colour).filter(Boolean))] as string[];
    const inStockSizes = [...new Set(lines.filter((l) => l.available).map((l) => l.size))].sort((a, b) => sizeOrder(a) - sizeOrder(b));
    const price = Math.min(...lines.filter((l) => l.available).map((l) => l.price));
    const was = Math.max(...lines.filter((l) => l.price === price).map((l) => l.was));
    const compareAtPrice = was > price ? new Prisma.Decimal(was) : null;
    const baseTitle = first.title.replace(/\s+/g, " ").trim();
    const name = `${brand} ${baseTitle}${colours.length === 1 ? ` – ${colours[0]}` : ""}`;
    const style = styleFor(first.tags, baseTitle);
    const variantInput = [
      ...new Map(
        lines.map((l) => {
          const options: Record<string, string> = { size: l.size };
          if (colours.length > 1 && l.colour) options.color = l.colour;
          return [JSON.stringify(options), { options, stock: l.available ? UNLIMITED_STOCK : 0, price: l.price === price ? null : l.price, sku: `${code}${l.colour ? `-${l.colour}` : ""}-${l.size}` }];
        }),
      ).values(),
    ];
    const variants = await validateVariants(category.id, "PK", variantInput);
    if (!variants.ok) {
      console.log(`skipped ${name}: ${variants.error}`);
      counts.skipped += 1;
      continue;
    }

    const existing = await prisma.product.findUnique({ where: { source_sourceRef: { source: SOURCE, sourceRef: code } } });
    if (existing) {
      if (!DRY) {
        await prisma.$transaction(async (tx) => {
          await tx.product.update({ where: { id: existing.id }, data: { basePrice: new Prisma.Decimal(price), compareAtPrice, availableForSale: true, stock: UNLIMITED_STOCK } });
          await syncProductVariants(tx, existing.id, variants.variants);
        });
      }
      counts.updated += 1;
      continue;
    }

    const description = describe(baseTitle, brand, categorySlug!, style, plain(first.body_html), colours, inStockSizes);
    const sources = products.flatMap((p) => p.images.map((i) => i.src)).filter((s, i, a) => a.indexOf(s) === i).slice(0, MAX_IMAGES * Math.min(products.length, 2));
    if (DRY) {
      if (counts.created < 4) console.log(`\n=== ${name} | ${categorySlug} | ${style} | Rs ${price}${compareAtPrice ? ` (was ${was})` : ""} | ${colours.join(", ")} | ${inStockSizes.join(", ")} | ${sources.length} photos\n${description}`);
      counts.created += 1;
      continue;
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
      continue;
    }
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
          metadata: { brand, style, ...(facts(plain(first.body_html)).material ? { material: facts(plain(first.body_html)).material } : {}) },
          source: SOURCE,
          sourceRef: code,
          images: { create: imageUrls.map((url, i) => ({ url, sortOrder: i })) },
        },
      });
      await syncProductVariants(tx, product.id, variants.variants);
    });
    counts.created += 1;
    console.log(`created ${name} (Rs ${price}, ${imageUrls.length} photos)`);
  }

  // Designs no longer in stock at the supplier: off sale (kept for order history).
  if (!DRY) {
    const gone = await prisma.product.updateMany({ where: { source: SOURCE, sourceRef: { notIn: seen }, availableForSale: true }, data: { availableForSale: false } });
    counts.offSale = gone.count;
  }
  console.log(`\ndone: ${JSON.stringify(counts)}`);
}

main().finally(() => prisma.$disconnect());
