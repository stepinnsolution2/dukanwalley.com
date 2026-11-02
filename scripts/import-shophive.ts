// Imports shophive.com (Magento: electronics, laptops, PC parts, appliances, gaming, audio, TVs,
// cameras, printers, phones…) as the store "shophive.com", shown as "shoplive", with a 15%
// commission. Products come from Shophive's public storefront GraphQL API (the one its own site
// uses), 100 per request, one request per second. Re-runnable: new products are added, prices
// refreshed, and products no longer listed go off sale.
//
//   npx tsx scripts/import-shophive.ts [--dry-run] [--limit=N] [--from-file=FILE]
import "dotenv/config";
import { randomBytes } from "crypto";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/slug";
import { saveUpload } from "../src/lib/storage";
import { hashPassword } from "../src/lib/password";
import { uniqueVendorSlug } from "../src/lib/vendor-slug";
import { UNLIMITED_STOCK } from "../src/lib/catalog";
import { Prisma } from "../src/generated/prisma/client";
import { KycStatus, ProductApprovalStatus, UserRole, VendorRestriction } from "../src/generated/prisma/enums";

const API = "https://www.shophive.com/graphql";
const SOURCE = "shophive";
const STORE_NAME = "shophive.com";
const STORE_EMAIL = "shophive-store@marketplace.internal";
const STORE_USERNAME = "shophive";
const STORE_PHONE = "+923111746756";
const SUPPLIER_EMAIL = "ceo@shophive.com";
const PUBLIC_NAME = "shoplive";
const COMMISSION_BPS = 1500;
const UA = "Mozilla/5.0 (compatible; DukanWalley catalogue import; +https://dukanwalley.com)";
const MAX_PHOTOS = 6;
const CONCURRENCY = 4;

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}`));
const DRY = !!arg("dry-run");
const LIMIT = Number(arg("limit=")?.split("=")[1] ?? 0);
const FROM_FILE = arg("from-file=")?.split("=").slice(1).join("=");

type Item = {
  sku: string;
  name: string;
  url_key: string;
  stock_status: string;
  categories: { name: string; url_path: string | null; level: number }[];
  price_range: { minimum_price: { final_price: { value: number }; regular_price: { value: number } } };
  media_gallery: { url: string; disabled: boolean; position: number | null }[];
  short_description: { html: string } | null;
  description: { html: string } | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const QUERY = (page: number) => `{ products(search: "", pageSize: 100, currentPage: ${page}) { page_info { total_pages }
  items { sku name url_key stock_status categories { name url_path level }
    price_range { minimum_price { final_price { value } regular_price { value } } }
    media_gallery { url disabled position } short_description { html } description { html } } } }`;

async function fetchAll(): Promise<Item[]> {
  if (FROM_FILE) return JSON.parse(readFileSync(FROM_FILE, "utf8"));
  const all: Item[] = [];
  for (let page = 1; ; page++) {
    let data: { products: { page_info: { total_pages: number }; items: Item[] } } | null = null;
    for (let a = 0; a < 5 && !data; a++) {
      try {
        const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json", "user-agent": UA }, body: JSON.stringify({ query: QUERY(page) }), signal: AbortSignal.timeout(90_000) });
        const j = await res.json();
        if (j.data?.products) data = j.data;
        else await sleep(15_000 * (a + 1));
      } catch {
        await sleep(15_000 * (a + 1));
      }
    }
    if (!data) throw new Error(`page ${page} failed`);
    all.push(...data.products.items);
    if (page >= data.products.page_info.total_pages) break;
    await sleep(1000);
  }
  return all;
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/&ndash;|&mdash;/g, "–").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&[a-z]+;/g, " ");

/** Their description HTML as tidy Markdown: list items as bullets, paragraphs as lines; no mention of Shophive. */
function toMarkdown(html: string) {
  const s = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\s*(br|\/p|\/div|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<\s*h\d[^>]*>/gi, "\n### ")
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ": ")
    .replace(/<[^>]+>/g, " ");
  return decode(s)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && l !== "-" && l !== "###" && !/shophive|shop hive|buy (now )?(online )?(at|from)|price in pakistan|cash on delivery|warranty claim|call us|whatsapp|with the merchant/i.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 5000);
}

/** The most specific of their categories (ignoring Deals/brand lists). */
function leafPath(it: Item) {
  const cs = it.categories.filter((c) => c.url_path && !/^(deals|buy\/deals|brands|shop\/brands)/.test(c.url_path)).sort((a, b) => b.level - a.level);
  return cs[0]?.url_path ?? "";
}

/** Our category: their category path first, then the product name. Null: not imported. */
function categoryFor(path: string, name: string): string | null {
  const p = path.toLowerCase();
  const n = name.toLowerCase();
  if (/digital-store|softwares|musical-instruments/.test(p) || /gift card|antivirus|license key|\bkey\b.*(windows|office)/.test(n)) return null;
  const laptopKind = () =>
    /rtx|gtx|gaming|nitro|predator|legion|\bloq\b|\brog\b|\btuf\b|omen|victus|alienware|katana|stealth/.test(n)
      ? "laptops-computers-gaming"
      : /thinkpad|elitebook|probook|latitude|vostro|expertbook|travelmate|zbook|precision|thinkbook/.test(n)
        ? "laptops-computers-business"
        : "laptops-computers-everyday";
  // Apple first (its section mixes everything).
  if (p.startsWith("apple/")) {
    if (/iphone/.test(p) && !/accessor/.test(p)) return "mobiles-tablets-smartphones";
    if (/ipad/.test(p) && !/accessor/.test(p)) return "mobiles-tablets-tablets";
    if (/watch/.test(p)) return "mobile-accessories-smart-watches";
    if (/airpod/.test(p)) return "mobile-accessories-earphones-headphones";
    if (/imac|mac-mini|mac-studio/.test(p) || /imac|mac mini|mac studio/.test(n)) return "laptops-computers-desktops";
    if (/\/mac\b|macbook/.test(p) || /macbook/.test(n)) return "laptops-computers-everyday";
  }
  const rules: [RegExp, string | (() => string)][] = [
    [/laptops-computers\/laptops/, laptopKind],
    [/computer-monitors|\/monitors/, "laptops-computers-monitors"],
    [/desktop-computers|all-in-one/, "laptops-computers-desktops"],
    [/motherboard|cpu-coolers|computer-casing|power-supply|computer-ram|graphic-card|\/processor|thermal|case-fans/, "computer-accessories-pc-components"],
    [/ssd-drives|internal-hard-drives|external-hard-drives|external-ssd|\/nas|usb-flash|memory-cards|\/storage/, "computer-accessories-storage"],
    [/printers|scanners|toner|cartridges/, "computer-accessories-printers"],
    [/networking|routers|switches|access-points|range-extenders|wifi-dongles/, "computer-accessories-networking"],
    [/laptop-bags/, "computer-accessories-bags-sleeves"],
    [/usb-hub|docking|laptop-chargers|laptop-adapters/, "computer-accessories-chargers-adapters"],
    [/gaming-mouse|gaming-keyboards|gaming-mousepads|\/mouse|keyboards|keyboard-mice-combos/, "computer-accessories-mice-keyboards"],
    [/computer-speakers|bluetooth-speakers|\/speakers|soundbar|home-theatres|amplifiers|microphone/, "electronics-audio-speakers"],
    [/earbuds|headphones|neckband|airpod/, "mobile-accessories-earphones-headphones"],
    [/video-games|gaming-chairs|joysticks|joypads|racing-wheels|gaming-consoles/, "electronics-gaming"],
    [/^tv\/|projector|tv-accessories|tv-trolleys|power-extension/, "electronics-tv-video"],
    [/cameras|webcam|gimbals|tripods|dslr/, "electronics-cameras"],
    [/refrigerators|washing-machine|air-conditioners|water-dispenser|water-geyser|heaters|air-purifiers|deep-freezer|dryer/, "home-kitchen-large-appliances"],
    [/appliances\/kitchen|blenders|kettle|microwave|air-fryer|coffee|food-processor|garment-care|vacuum|home-automation|appliances\/home/, "home-kitchen-small-appliances"],
    [/office-products|\/ups|power-stations|shredders|electronic-safe|land-line|presenters|world-adapters|travel-accessories/, "electronics-office-power"],
    [/tablet-accessories|ipad-accessories|iphone-accessories|\/covers/, "mobile-accessories-cases-covers"],
    [/xp-pen|wacom/, "computer-accessories"],
    [/^tablets/, "mobiles-tablets-tablets"],
    [/smart-watches|whoop/, "mobile-accessories-smart-watches"],
    [/power-banks/, "mobile-accessories-power-banks"],
    [/wall-chargers|car-chargers|wireless-chargers|\/cables|iphone-cables/, "mobile-accessories-chargers-cables"],
    [/mobile-accessories/, "mobile-accessories"],
    [/mobile-phones/, "mobiles-tablets-smartphones"],
    [/hair-grooming/, "beauty-personal-care-mens-grooming"],
    [/electric-scooters/, "sports-fitness-outdoor-cycling"],
    [/laptop-accessories|computer-peripherals|mac-accessories/, "computer-accessories"],
  ];
  for (const [re, slug] of rules) if (re.test(p)) return typeof slug === "string" ? slug : slug();
  // No usable category: decide from the name.
  const byName: [RegExp, string | (() => string)][] = [
    [/power ?bank/, "mobile-accessories-power-banks"],
    [/screen protector|tempered glass|\bcase\b|\bcover\b/, "mobile-accessories-cases-covers"],
    [/\b\d{1,2}gb\s*(ram\s*)?\+?\s*\d{2,4}(gb|tb)\b/, "mobiles-tablets-smartphones"],
    [/^itel\b|\bfeature phone\b/, "mobiles-tablets-feature-phones"],
    [/air ?conditioner|air purifier/, "home-kitchen-large-appliances"],
    [/straightener|hair dryer|multi-?styler|airwrap|trimmer|shaver/, "beauty-personal-care-hair-care"],
    [/argb fan|case fan|cpu cooler|thermal paste/, "computer-accessories-pc-components"],
    [/tracker|airtag|anti-?loss/, "mobile-accessories"],
    [/smart plug|night light|diffuser|lint remover/, "home-kitchen-small-appliances"],
    [/battery pack/, "electronics-cameras"],
    [/steering wheel|andaseat|gaming chair|racing/, "electronics-gaming"],
    [/speakerphone|conference/, "electronics-office-power"],
    [/laptop|notebook|macbook|core\s?i\d|ryzen|core ultra/, laptopKind],
    [/monitor/, "laptops-computers-monitors"],
    [/mouse|keyboard/, "computer-accessories-mice-keyboards"],
    [/earbuds|headphone|headset|earphone/, "mobile-accessories-earphones-headphones"],
    [/speaker|soundbar|microphone|\bmic\b/, "electronics-audio-speakers"],
    [/charger|cable|adapter|\bhub\b/, "mobile-accessories-chargers-cables"],
    [/power ?bank/, "mobile-accessories-power-banks"],
    [/router|switch|access point/, "computer-accessories-networking"],
    [/\bssd\b|\bhdd\b|flash drive|memory card/, "computer-accessories-storage"],
    [/watch/, "mobile-accessories-smart-watches"],
    [/camera|lens/, "electronics-cameras"],
    [/printer|toner|cartridge|scanner/, "computer-accessories-printers"],
    [/\btv\b|projector/, "electronics-tv-video"],
    [/controller|gamepad|playstation|xbox|nintendo/, "electronics-gaming"],
  ];
  for (const [re, slug] of byName) if (re.test(n)) return typeof slug === "string" ? slug : slug();
  return null;
}

const BRAND_FIX: Record<string, string> = { hp: "HP", msi: "MSI", lg: "LG", tcl: "TCL", jbl: "JBL", benq: "BenQ", "tp-link": "TP-Link", "d-link": "D-Link", asus: "ASUS", aoc: "AOC", pny: "PNY", nzxt: "NZXT", wd: "WD", ugreen: "UGREEN" };
const brandOf = (name: string) => {
  const w = name.trim().split(/\s+/)[0].replace(/[^\w-]/g, "");
  return BRAND_FIX[w.toLowerCase()] ?? (w === w.toUpperCase() && w.length > 3 ? w[0] + w.slice(1).toLowerCase() : w);
};

function cleanName(name: string) {
  const n = decode(name).replace(/\s+/g, " ").trim();
  if (n.length <= 160) return n;
  const cut = n.slice(0, 160);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,(-]+$/, "") + "…";
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
          market: "PK",
          kycStatus: KycStatus.APPROVED,
          restriction: VendorRestriction.NONE,
          commissionOverrideBps: COMMISSION_BPS,
          verificationNotes: `Supplier: https://www.shophive.com (Shophive). Phone ${STORE_PHONE}, email ${SUPPLIER_EMAIL}. Commission 15%. Created ${new Date().toISOString().slice(0, 10)}.`,
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
    const res = await fetch(src, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await saveUpload(new Blob([new Uint8Array(await res.arrayBuffer())]).stream(), "image")).url;
  } catch (e) {
    if (attempts <= 1) throw e;
    await sleep(2000);
    return download(src, attempts - 1);
  }
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) await fn(items[next++]); }));
}

async function main() {
  let items = (await fetchAll()).filter((i) => i.stock_status === "IN_STOCK" && i.price_range.minimum_price.final_price.value > 0);
  console.log(`${items.length} in-stock products${DRY ? " (dry run)" : ""}`);
  if (LIMIT) items = items.slice(0, LIMIT);
  const store = await ensureStore();
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c]));
  const counts = { created: 0, updated: 0, skipped: 0, offSale: 0, photos: 0 };
  const perCategory = new Map<string, number>();
  const skipped = new Map<string, number>();
  const seen: string[] = [];

  await pool(items, CONCURRENCY, async (it) => {
    const path = leafPath(it);
    const slug = categoryFor(path, it.name);
    const category = slug ? categories.get(slug) : undefined;
    if (!category) {
      skipped.set(path || "(no category)", (skipped.get(path || "(no category)") ?? 0) + 1);
      counts.skipped += 1;
      return;
    }
    perCategory.set(slug!, (perCategory.get(slug!) ?? 0) + 1);
    seen.push(it.sku);
    const price = Math.round(it.price_range.minimum_price.final_price.value);
    const regular = Math.round(it.price_range.minimum_price.regular_price.value);
    const compareAtPrice = regular > price ? new Prisma.Decimal(regular) : null;
    const existing = await prisma.product.findUnique({ where: { source_sourceRef: { source: SOURCE, sourceRef: it.sku } } });
    if (existing) {
      if (!DRY) await prisma.product.update({ where: { id: existing.id }, data: { basePrice: new Prisma.Decimal(price), compareAtPrice, availableForSale: true, stock: UNLIMITED_STOCK } });
      counts.updated += 1;
      return;
    }
    const name = cleanName(it.name);
    const body = [toMarkdown(it.short_description?.html ?? ""), toMarkdown(it.description?.html ?? "")].filter(Boolean).join("\n\n");
    const description = `${name}.\n\n${body ? `## Details\n\n${body}\n\n` : ""}## Delivery\n\nSold by ${PUBLIC_NAME} on DukanWalley. Delivered across Pakistan.`;
    const photos = it.media_gallery.filter((m) => !m.disabled && m.url).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((m) => m.url).filter((u, i, a) => a.indexOf(u) === i).slice(0, MAX_PHOTOS);
    if (DRY) {
      if (counts.created < 4) console.log(`\n=== ${name} | ${path} → ${slug} | Rs ${price}${compareAtPrice ? ` (was ${regular})` : ""} | ${photos.length} photos\n${description.slice(0, 700)}`);
      counts.created += 1;
      return;
    }
    const imageUrls: string[] = [];
    for (const src of photos) {
      try {
        imageUrls.push(await download(src));
      } catch (e) {
        console.log(`  photo failed (${(e as Error).message}): ${src}`);
      }
    }
    if (!imageUrls.length) {
      counts.skipped += 1;
      return;
    }
    counts.photos += imageUrls.length;
    await prisma.product.create({
      data: {
        slug: `${slugify(name).slice(0, 80)}-${randomBytes(3).toString("hex")}`,
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
        metadata: { brand: brandOf(name), ...(slug!.startsWith("laptops-computers") ? { condition: /\bused\b/i.test(name) ? "Used" : /refurb/i.test(name) ? "Refurbished" : "New" } : {}) },
        source: SOURCE,
        sourceRef: it.sku,
        images: { create: imageUrls.map((url, i) => ({ url, sortOrder: i })) },
      },
    });
    counts.created += 1;
    if (counts.created % 250 === 0) console.log(`… ${counts.created} created (${counts.photos} photos)`);
  });

  if (!DRY && !LIMIT) {
    const gone = await prisma.product.updateMany({ where: { source: SOURCE, sourceRef: { notIn: seen }, availableForSale: true }, data: { availableForSale: false } });
    counts.offSale = gone.count;
  }
  console.log(`\ndone: ${JSON.stringify(counts)}`);
  console.log("by category:", [...perCategory].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
  if (skipped.size) console.log("not imported:", [...skipped].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} × ${k}`).join(", "));
}

main().finally(() => prisma.$disconnect());
