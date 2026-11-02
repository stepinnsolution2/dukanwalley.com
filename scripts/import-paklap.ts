// Imports in-stock products from paklap.pk (Magento: laptops new/used/refurbished, monitors,
// accessories, some phones/tablets/watches) as the store "paklap.pk", shown as "laptoppak", with a
// 15% commission. Paklap has no product feed, so product pages listed in its sitemap are read
// politely (one per second, only paths robots.txt allows) into a resumable crawl file first.
//
//   npx tsx scripts/import-paklap.ts --crawl            read pages (resumes where it stopped)
//   npx tsx scripts/import-paklap.ts --import [--dry-run] [--limit=N]
import "dotenv/config";
import { randomBytes } from "crypto";
import { appendFileSync, existsSync, readFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/slug";
import { saveUpload } from "../src/lib/storage";
import { hashPassword } from "../src/lib/password";
import { uniqueVendorSlug } from "../src/lib/vendor-slug";
import { UNLIMITED_STOCK } from "../src/lib/catalog";
import { Prisma } from "../src/generated/prisma/client";
import { KycStatus, ProductApprovalStatus, UserRole, VendorRestriction } from "../src/generated/prisma/enums";

const SITE = "https://www.paklap.pk";
const SOURCE = "paklap";
const STORE_NAME = "paklap.pk";
const STORE_EMAIL = "paklap-store@marketplace.internal";
const STORE_USERNAME = "paklap";
const STORE_PHONE = "+923041113005";
const SUPPLIER_EMAIL = "support@paklap.pk";
const PUBLIC_NAME = "laptoppak";
const COMMISSION_BPS = 1500;
const UA = "Mozilla/5.0 (compatible; DukanWalley catalogue import; +https://dukanwalley.com)";
const CRAWL_FILE = process.env.PAKLAP_CRAWL_FILE ?? `${process.env.HOME ?? "."}/paklap-crawl.jsonl`;
const MAX_PHOTOS = 6;

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}`));
const DRY = !!arg("dry-run");
const LIMIT = Number(arg("limit=")?.split("=")[1] ?? 0);

type Crawled = {
  url: string;
  name: string;
  sku: string | null;
  price: number | null;
  oldPrice: number | null;
  inStock: boolean;
  condition: "New" | "Used" | "Refurbished";
  images: string[];
  specs: string[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

async function get(url: string): Promise<string | null> {
  for (let a = 0; a < 4; a++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 404 || res.status === 410) return null;
      if (res.ok) return await res.text();
      if (res.status === 429 || res.status >= 500) await sleep(30_000 * (a + 1));
      else return null;
    } catch {
      await sleep(10_000 * (a + 1));
    }
  }
  return null;
}

function parse(url: string, html: string): Crawled | null {
  const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1]);
      } catch {
        return null;
      }
    })
    .find((j) => j && j["@type"] === "Product");
  if (!ld) return null;
  const offer = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
  const name = decode(String(ld.name ?? "")).replace(/\s+/g, " ").trim();
  const cond = String(offer?.itemCondition ?? "");
  const condition: Crawled["condition"] = /refurb/i.test(cond) || /refurbished/i.test(name) ? "Refurbished" : /used/i.test(cond) || /\bused\b/i.test(name) ? "Used" : "New";
  const old = html.match(/old-price[\s\S]{0,400}?data-price-amount="([\d.]+)"/)?.[1];
  // Gallery: "full" image URLs in the page's JSON (slashes escaped).
  const images = [...new Set([...html.matchAll(/"full":"([^"]+)"/g)].map((m) => m[1].replace(/\\+\//g, "/")))].filter((u) => /^https:\/\/www\.paklap\.pk\/media\/catalog\/product\//.test(u));
  if (!images.length && typeof ld.image === "string") images.push(ld.image);
  // Key points: list items of the overview/description, else the structured description.
  const block = html.match(/class="product attribute (?:overview|description)"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
  let specs = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1])).filter((s) => s.length > 1 && s.length < 200);
  if (!specs.length) specs = text(String(ld.description ?? "")).split(/\s{2,}|\s(?=\d+(?:GB|TB)\b)|\|/).map((s) => s.trim()).filter((s) => s.length > 2);
  // Their own sales lines ("Latest Price in Pakistan…", "Paklap provides…") are not specifications.
  specs = specs.filter((s) => !/paklap|latest price|price in pakistan|cash on delivery|\.\.\.$/i.test(s));
  return {
    url,
    name,
    sku: ld.sku ? String(ld.sku) : null,
    price: offer?.price != null ? Number(offer.price) : null,
    oldPrice: old ? Number(old) : null,
    inStock: /InStock/i.test(String(offer?.availability ?? "")) || /class="stock available"/.test(html),
    condition,
    images,
    specs: specs.slice(0, 20),
  };
}

async function crawl() {
  const index = await get(`${SITE}/sitemap.xml`);
  if (!index) throw new Error("sitemap unavailable");
  const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls: string[] = [];
  for (const m of maps) {
    const xml = await get(m);
    if (xml) urls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]));
    await sleep(1000);
  }
  // Product pages are top-level "name.html" (category pages sit in folders); robots.txt allows them.
  const products = urls.filter((u) => /^https:\/\/www\.paklap\.pk\/[^/?]+\.html$/.test(u));
  const done = new Set(existsSync(CRAWL_FILE) ? readFileSync(CRAWL_FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).url as string) : []);
  // --sample=N: read N pages spread across the sitemap (for testing).
  const sample = Number(arg("sample=")?.split("=")[1] ?? 0);
  const rest = products.filter((u) => !done.has(u));
  const todo = sample ? rest.filter((_, i) => i % Math.max(1, Math.floor(rest.length / sample)) === 0).slice(0, sample) : rest;
  console.log(`${products.length} product pages in the sitemap, ${done.size} already read, ${todo.length} to go`);
  let n = 0;
  for (const url of todo) {
    const html = await get(url);
    const item = html ? parse(url, html) : null;
    appendFileSync(CRAWL_FILE, JSON.stringify(item ?? { url, skip: true }) + "\n");
    if (++n % 250 === 0) console.log(`… ${n}/${todo.length} read`);
    await sleep(1000);
  }
  console.log("crawl done");
}

// ---------------------------------------------------------------------------------------------

const BRANDS = ["hp", "dell", "lenovo", "apple", "asus", "acer", "msi", "samsung", "microsoft", "a4tech", "logitech", "huawei", "xiaomi", "gigabyte", "razer", "toshiba", "fujitsu", "lg", "google", "infinix", "tecno", "realme", "anker", "corsair", "kingston", "adata", "sandisk", "transcend", "seagate", "wd", "western digital", "tp-link", "d-link", "jbl", "sony", "redragon", "bloody", "havit", "fantech", "coolbell", "baseus", "ugreen", "aoc", "viewsonic", "benq", "philips", "zebronics", "dahua", "hikvision", "canon", "epson", "brother", "amazfit", "haylou", "oneplus", "nothing", "oppo", "vivo", "honor", "nokia", "motorola", "joyroom", "green lion", "porodo", "kieslect", "zero", "audionic", "faster", "dany"];
function brandOf(name: string) {
  const n = name.toLowerCase();
  const b = BRANDS.find((x) => n.startsWith(x + " ") || n.startsWith(x + "-")) ?? BRANDS.find((x) => new RegExp(`\\b${x}\\b`).test(n));
  if (!b) return name.split(/\s+/)[0];
  return { hp: "HP", msi: "MSI", lg: "LG", wd: "WD", aoc: "AOC", "tp-link": "TP-Link", "d-link": "D-Link", a4tech: "A4Tech", jbl: "JBL", benq: "BenQ", oneplus: "OnePlus" }[b] ?? b.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Our category from the product name. Null: not something we sell (printers, UPS, coolers…). */
function categoryFor(name: string): string | null {
  const n = name.toLowerCase();
  const cpu = /core\s?i\d|core ultra|ryzen|celeron|pentium|\bm[1-4]\b.*chip|apple m[1-4]|snapdragon x|intel n\d{3}/.test(n);
  const laptopWord = /laptop|notebook|macbook|thinkpad|elitebook|probook|latitude|inspiron|vostro|ideapad|yoga|zenbook|vivobook|expertbook|pavilion|envy|spectre|omen|victus|nitro|predator|aspire|swift|legion|\bloq\b|\brog\b|\btuf\b|zbook|precision|xps|chromebook|surface laptop|galaxy book|x360|dragonfly|travelmate|alienware|katana|thinkbook|probook/.test(n);
  if (/\b(bag|backpack|sleeve|carry case)\b/.test(n) && !cpu) return "computer-accessories-bags-sleeves";
  if (/\bwatch\b/.test(n)) return "mobile-accessories-smart-watches";
  if (/ipad|\btablet\b|galaxy tab|\btab s\d/.test(n)) return "mobiles-tablets-tablets";
  if (/iphone|smartphone|galaxy [asz]\d|mobile phone|pixel \d/.test(n) && !laptopWord) return "mobiles-tablets-smartphones";
  if (/\bmonitor\b/.test(n) && !laptopWord) return "laptops-computers-monitors";
  if (/router|\bswitch\b|access point|range extender|network (adapter|card)/.test(n)) return "computer-accessories-networking";
  if (/mouse|keyboard|keypad|mousepad|mouse pad|wireless combo|\bcombo\b/.test(n) && !cpu) return "computer-accessories-mice-keyboards";
  if (/all.in.one|\baio\b|desktop (pc|computer)|mini pc|imac|mac mini|mac studio|tower pc/.test(n) || (/desktop/.test(n) && cpu)) return "laptops-computers-desktops";
  if (cpu || laptopWord) {
    if (/rtx|gtx|gaming|nitro|predator|legion|\bloq\b|\brog\b|\btuf\b|omen|victus|alienware|katana|stealth|\bgf63\b|\bcyborg\b/.test(n)) return "laptops-computers-gaming";
    if (/thinkpad|elitebook|probook|latitude|vostro|expertbook|travelmate|zbook|precision|dragonfly|thinkbook/.test(n)) return "laptops-computers-business";
    return "laptops-computers-everyday";
  }
  if (/mouse|keyboard|keypad|mousepad|mouse pad/.test(n)) return "computer-accessories-mice-keyboards";
  if (/\bssd\b|\bhdd\b|hard drive|hard disk|flash drive|usb drive|memory card|micro ?sd|\bsd card|\bnvme\b|\bddr[345]\b|\bram\b/.test(n)) return "computer-accessories-storage";
  if (/power ?bank/.test(n)) return "mobile-accessories-power-banks";
  if (/charger|adapter|\bhub\b|dock|docking|\bcable\b/.test(n)) return "computer-accessories-chargers-adapters";
  if (/router|\bswitch\b|wi-?fi|access point|range extender|network/.test(n)) return "computer-accessories-networking";
  if (/headphone|headset|earbuds|earphone|airpods|buds/.test(n)) return "mobile-accessories-earphones-headphones";
  if (/speaker|soundbar/.test(n)) return "electronics-audio-speakers";
  if (/webcam|camera/.test(n)) return "electronics-cameras";
  if (/playstation|\bps[45]\b|xbox|nintendo|controller|gamepad|joystick/.test(n)) return "electronics-gaming";
  return null;
}

const num = (re: RegExp, s: string) => {
  const m = s.match(re);
  return m ? Number(m[1]) * (m[2] && /tb/i.test(m[2]) ? 1024 : 1) : undefined;
};

function cleanName(name: string) {
  const n = name.replace(/\s+/g, " ").replace(/\s*[-–]\s*$/, "").trim();
  if (n.length <= 160) return n;
  const cut = n.slice(0, 160);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,(-]+$/, "") + "…";
}

function describe(c: Crawled, slug: string) {
  const kind = slug.startsWith("laptops-computers-") && !/monitors|desktops/.test(slug) ? "laptop" : "product";
  const warranty = c.name.match(/\(([^()]*warranty[^()]*)\)/i)?.[1]?.split(",").find((x) => /warranty/i.test(x))?.trim();
  const condLine =
    c.condition === "New"
      ? null
      : c.condition === "Used"
        ? "Condition: **used**. A pre-owned unit, checked and in working order; it may show light signs of use."
        : "Condition: **refurbished**. A pre-owned unit that has been inspected and restored to working order.";
  return [
    `${cleanName(c.name)}.`,
    ...(condLine ? [condLine] : []),
    c.specs.length ? `## Specifications\n\n${c.specs.map((s) => `- ${s}`).join("\n")}` : null,
    warranty ? `## Warranty\n\n${warranty}.` : null,
    `## Delivery\n\nSold by ${PUBLIC_NAME} on DukanWalley. Delivered across Pakistan; check each ${kind}'s condition and specifications before ordering.`,
  ]
    .filter(Boolean)
    .join("\n\n");
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
          city: "Karachi",
          market: "PK",
          kycStatus: KycStatus.APPROVED,
          restriction: VendorRestriction.NONE,
          commissionOverrideBps: COMMISSION_BPS,
          verificationNotes: `Supplier: ${SITE} (Paklap, Karachi). Phone 0304-1113005, email ${SUPPLIER_EMAIL}. Commission 15%. Created ${new Date().toISOString().slice(0, 10)}.`,
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

async function importCrawl() {
  if (!existsSync(CRAWL_FILE)) throw new Error(`no crawl file at ${CRAWL_FILE}; run --crawl first`);
  const rows = readFileSync(CRAWL_FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Crawled & { skip?: boolean });
  const items = rows.filter((r) => !r.skip && r.inStock && r.price && r.price > 0);
  console.log(`${rows.length} pages read, ${items.length} in stock with a price${DRY ? " (dry run)" : ""}`);
  const store = await ensureStore();
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c]));
  const counts = { created: 0, updated: 0, skipped: 0, offSale: 0 };
  const skippedNames: string[] = [];
  const perCategory = new Map<string, number>();
  const seen: string[] = [];
  let list = items;
  if (LIMIT) list = list.slice(0, LIMIT);

  for (const c of list) {
    const slug = categoryFor(c.name);
    const category = slug ? categories.get(slug) : undefined;
    if (!category) {
      counts.skipped += 1;
      if (skippedNames.length < 40) skippedNames.push(c.name.slice(0, 70));
      continue;
    }
    perCategory.set(slug!, (perCategory.get(slug!) ?? 0) + 1);
    const ref = c.url.replace(/^.*\//, "").replace(/\.html$/, "");
    seen.push(ref);
    const price = Math.round(c.price!);
    const compareAtPrice = c.oldPrice && c.oldPrice > price ? new Prisma.Decimal(Math.round(c.oldPrice)) : null;
    const existing = await prisma.product.findUnique({ where: { source_sourceRef: { source: SOURCE, sourceRef: ref } } });
    if (existing) {
      if (!DRY) await prisma.product.update({ where: { id: existing.id }, data: { basePrice: new Prisma.Decimal(price), compareAtPrice, availableForSale: true, stock: UNLIMITED_STOCK } });
      counts.updated += 1;
      continue;
    }
    const name = cleanName(c.name);
    const isComputer = slug!.startsWith("laptops-computers");
    const metadata: Record<string, unknown> = { brand: brandOf(c.name), ...(c.sku ? { model: c.sku } : {}) };
    if (isComputer) {
      metadata.condition = c.condition;
      const cpu = c.name.match(/(Core\s?Ultra\s?X?\d\s?\w*|Core\s?i\d[-\s]?\w*|Ryzen\s?\d\s?\w*|Apple\s?M\d\s?(?:Pro|Max)?|M\d\s?(?:Pro|Max)?\s?Chip|Celeron\s?\w*)/i)?.[1];
      if (cpu) metadata.processor = cpu.trim();
      const ram = num(/(\d{1,3})\s*-?\s*GB\s*(?:DDR\d|RAM|LPDDR|Unified|Memory)?(?=[\s,-])/i, c.name);
      if (ram && ram <= 128) metadata.ram_gb = ram;
      const storage = num(/(\d{3,4}|\d)\s*-?\s*(GB|TB)\s*(?:M\.2\s*)?(?:NVMe\s*)?(?:SSD|HDD|Storage)/i, c.name);
      if (storage) metadata.storage_gb = storage;
    }
    if (DRY) {
      if (counts.created < 6) console.log(`\n=== ${name} | ${slug} | Rs ${price}${compareAtPrice ? ` (was ${c.oldPrice})` : ""} | ${c.condition} | ${c.images.length} photos | ${JSON.stringify(metadata)}\n${describe(c, slug!).slice(0, 600)}`);
      counts.created += 1;
      continue;
    }
    const imageUrls: string[] = [];
    for (const src of c.images.slice(0, MAX_PHOTOS)) {
      try {
        imageUrls.push(await download(src));
      } catch (e) {
        console.log(`  photo failed (${(e as Error).message}): ${src}`);
      }
      await sleep(300);
    }
    if (!imageUrls.length) {
      counts.skipped += 1;
      continue;
    }
    await prisma.product.create({
      data: {
        slug: `${slugify(name).slice(0, 80)}-${randomBytes(3).toString("hex")}`,
        name,
        description: describe(c, slug!),
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
        metadata: metadata as Prisma.InputJsonValue,
        source: SOURCE,
        sourceRef: ref,
        images: { create: imageUrls.map((url, i) => ({ url, sortOrder: i })) },
      },
    });
    counts.created += 1;
    if (counts.created % 100 === 0) console.log(`… ${counts.created} created`);
  }

  if (!DRY && !LIMIT) {
    const gone = await prisma.product.updateMany({ where: { source: SOURCE, sourceRef: { notIn: seen }, availableForSale: true }, data: { availableForSale: false } });
    counts.offSale = gone.count;
  }
  console.log(`\ndone: ${JSON.stringify(counts)}`);
  console.log("by category:", [...perCategory].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
  if (skippedNames.length) console.log("not imported (no category), e.g.:\n  " + skippedNames.join("\n  "));
}

(arg("crawl") ? crawl() : arg("import") ? importCrawl() : Promise.reject(new Error("use --crawl or --import"))).finally(() => prisma.$disconnect());
