// One-off (2026-10-28): first import of Alpha Digital's catalogue from their Shopify store's public
// product feed, before they send an Excel file. Prices are their current sale prices; names and
// descriptions are written here from the product facts (brand, model, type, resolution), not copied.
// Re-running only refreshes prices of products already imported.
//
//   npx tsx scripts/import-alphadigital.ts            (add --dry-run to only print)
import "dotenv/config";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/slug";
import { saveUpload } from "../src/lib/storage";
import { uniqueVendorSlug } from "../src/lib/vendor-slug";
import { Prisma } from "../src/generated/prisma/client";
import { KycStatus, ProductApprovalStatus, UserRole, VendorRestriction } from "../src/generated/prisma/enums";

const FEED = "https://www.alphadigital.pk/products.json?limit=250";
const SOURCE = "alphadigital";
const STORE_NAME = "Alpha Digital";
const STORE_EMAIL = "alphadigital-store@marketplace.internal";
const STOCK = 10;
const MAX_IMAGES = 8;
const DRY = process.argv.includes("--dry-run");

const SECURITY = {
  slug: "electronics-smart-home-security",
  name: "Smart Home & Security",
  description:
    "Smart door locks, video door phones and other home security devices. Each listing gives the brand, model and key features so you can compare options from different sellers.",
};

type ShopifyProduct = {
  handle: string;
  title: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: { price: string; sku: string | null; available: boolean }[];
  images: { src: string }[];
};

type Kind = "indoor" | "outdoor" | "lock" | "handle-lock" | "doorbell" | "sd";

function kindOf(p: ShopifyProduct): Kind {
  const tags = p.tags.map((t) => t.toLowerCase());
  if (/sd card/i.test(p.title)) return "sd";
  if (tags.includes("indoor camera")) return "indoor";
  if (tags.includes("outdoor camera")) return "outdoor";
  if (tags.includes("handle lock")) return "handle-lock";
  if (tags.includes("video door phone") || p.product_type === "Video Doorbell") return "doorbell";
  if (tags.includes("smart lock") || p.product_type === "Smart Lock") return "lock";
  throw new Error(`unknown product type: ${p.title}`);
}

const UPPER = new Set(["aov", "pt", "vt", "sc", "en"]);
/** "IMOU Cruiser Sc 4G (3K) 5MP" → model "Cruiser SC 4G", resolution "3K, 5MP". */
function parseTitle(p: ShopifyProduct) {
  const brand = p.vendor === "Alpha digital" ? "Alpha Digital" : p.vendor.toUpperCase();
  const res = p.title.match(/\(([^)]+)\)\s*(\d+MP)?/);
  const resolution = res ? [res[1], res[2]].filter(Boolean).join(", ") : null;
  const model = p.title
    .replace(res?.[0] ?? "", "")
    .replace(new RegExp(`^${p.vendor}\\s+`, "i"), "")
    .replace(/\s+Smart Lock$/i, "")
    .trim()
    .split(/\s+/)
    .map((w) => (UPPER.has(w.toLowerCase()) || /^[a-z]{1,3}\d/i.test(w) ? w.toUpperCase() : w))
    .join(" ");
  return { brand, model, resolution };
}

const APP: Record<string, string> = { IMOU: "Imou Life", EZVIZ: "EZVIZ" };
const DELIVERY =
  "Sold by Alpha Digital on DukanWalley. Free delivery to Punjab, KPK, Sindh and Islamabad, usually within 3 working days, with cash on delivery.";

function resolutionNote(resolution: string) {
  if (/\+/.test(resolution)) return `two lenses (${resolution}), so one camera covers two views at once`;
  if (/1080P/i.test(resolution)) return `Full HD ${resolution.replace(/1080P,?\s*/i, "1080p, ")} resolution`;
  return `${resolution} resolution for clearer detail than Full HD cameras`;
}

function write(p: ShopifyProduct, kind: Kind) {
  const { brand, model, resolution } = parseTitle(p);
  const app = APP[brand];
  const is4g = /\b4G\b/.test(model);
  const lines: string[] = [];
  const facts: [string, string][] = [["Brand", brand], ["Model", model]];
  let name: string;

  if (kind === "indoor" || kind === "outdoor") {
    const type = kind === "indoor" ? "Indoor Security Camera" : "Outdoor Security Camera";
    name = `${brand} ${model} ${type}${resolution ? ` (${resolution})` : ""}`;
    lines.push(
      `The ${brand} ${model} is ${kind === "indoor" ? "an indoor" : "an outdoor"} security camera${resolution ? ` with ${resolutionNote(resolution)}` : ""}.`,
      kind === "indoor"
        ? "Use it to keep an eye on your home, children, elderly parents, pets, a shop counter or an office, and watch live video from your phone."
        : "Mount it at a gate, entrance, driveway, garage or shop front, and check live video from your phone wherever you are.",
    );
    if (is4g) lines.push("This is a 4G model: it works over a mobile SIM data connection, which makes it useful at sites without Wi-Fi, such as farms, plots and construction sites.");
    if (/\bDual\b/i.test(model) && !/\+/.test(resolution ?? "")) lines.push("It is a dual-lens camera, giving two views from one unit.");
    if (app) lines.push(`Setup and viewing are done in the ${app} app.`);
    facts.push(["Type", type.replace(" Security", "")]);
    if (resolution) facts.push(["Resolution", resolution]);
    if (is4g) facts.push(["Connection", "4G (SIM)"]);
  } else if (kind === "lock" || kind === "handle-lock") {
    const type = kind === "lock" ? "Smart Door Lock" : "Smart Handle Lock";
    name = `${brand} ${model.replace(/-G-W-EN$/, "")} ${type}`;
    lines.push(
      `The ${brand} ${model} is a ${type.toLowerCase()} for homes, apartments and offices, so you don't need to carry keys.`,
    );
    if (/K1S/.test(model)) {
      lines.push([
        "Main features:",
        "• Fingerprint unlocking, with room for up to 100 fingerprints for family members, staff or tenants",
        "• Also opens with RFID cards (up to 10) and PIN codes (up to 10)",
        "• One-time temporary codes for guests, cleaners and other short visits",
        "• Connects to 2.4 GHz Wi-Fi and is managed from the Imou Life app",
        "• Fits doors 35–100 mm thick",
        "• Runs on 4 AA batteries, which last around 12 months with normal use",
      ].join("\n"));
    } else {
      lines.push("See the photos for its unlocking options and design. If you're not sure it fits your door, contact us before ordering and we'll check for you.");
    }
    facts.push(["Type", type]);
  } else if (kind === "doorbell") {
    name = `${brand} ${model} Video Door Phone`;
    lines.push(
      `The ${brand} ${model} is a video door phone: see who is at your gate or door before you open it.`,
      "A good fit for houses, apartments and offices where you want to check visitors first.",
    );
    facts.push(["Type", "Video Door Phone"]);
  } else {
    const size = p.title.match(/(\d+)\s*GB/i)?.[1];
    name = `Alpha Digital SD Memory Card ${size} GB`;
    lines.push(
      `A ${size} GB SD memory card from Alpha Digital for storing photos, videos and recordings.`,
      "Useful as extra storage for cameras, including security cameras that record to a memory card. Check that your device supports SD cards of this size before you buy.",
    );
    facts.splice(1, 1, ["Capacity", `${size} GB`]);
  }

  const description = [lines.join("\n\n"), facts.map(([k, v]) => `${k}: ${v}`).join("\n"), DELIVERY].join("\n\n");
  const categorySlug =
    kind === "sd" ? "computer-accessories-storage" : kind === "indoor" || kind === "outdoor" ? "electronics-cameras" : SECURITY.slug;
  return { name, description, categorySlug };
}

async function fetchAll(): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  for (let page = 1; page < 50; page++) {
    const res = await fetch(`${FEED}&page=${page}`, { headers: { "user-agent": "DukanWalley catalogue import" } });
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
    const { products } = (await res.json()) as { products: ShopifyProduct[] };
    if (!products.length) break;
    all.push(...products);
  }
  return all;
}

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
          slug: await uniqueVendorSlug(STORE_NAME),
          phone: "-",
          addressLine1: "-",
          market: "PK",
          kycStatus: KycStatus.APPROVED,
          restriction: VendorRestriction.NONE,
          verificationNotes: "Created for the first import from alphadigital.pk (2026-10-28).",
        },
      },
    },
    include: { vendorProfile: true },
  });
  console.log(`created store "${STORE_NAME}"`);
  return user.vendorProfile!;
}

async function ensureSecurityCategory() {
  const existing = await prisma.category.findUnique({ where: { slug: SECURITY.slug } });
  if (existing || DRY) return;
  const parent = await prisma.category.findUniqueOrThrow({ where: { slug: "electronics" } });
  await prisma.category.create({ data: { ...SECURITY, parentId: parent.id } });
  console.log(`created category Electronics › ${SECURITY.name}`);
}

async function download(url: string, attempts = 3): Promise<string> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    return (await saveUpload(res.body, "image")).url;
  } catch (e) {
    if (attempts <= 1) throw e;
    return download(url, attempts - 1);
  }
}

async function main() {
  const feed = await fetchAll();
  console.log(`${feed.length} products in the feed${DRY ? " (dry run)" : ""}`);
  const store = await ensureStore();
  await ensureSecurityCategory();
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c]));

  for (const p of feed) {
    const { name, description, categorySlug } = write(p, kindOf(p));
    const price = Math.round(Number(p.variants[0].price));
    const existing = await prisma.product.findUnique({ where: { source_sourceRef: { source: SOURCE, sourceRef: p.handle } } });
    if (existing) {
      if (Number(existing.basePrice) !== price && !DRY) {
        await prisma.product.update({ where: { id: existing.id }, data: { basePrice: new Prisma.Decimal(price) } });
      }
      console.log(`updated ${name}: Rs ${existing.basePrice} → ${price}`);
      continue;
    }
    const sources = p.images.slice(0, MAX_IMAGES).map((i) => i.src);
    if (DRY) {
      console.log(`\n=== ${name} | ${categorySlug} | Rs ${price} | ${sources.length} images\n${description}`);
      continue;
    }
    const category = categories.get(categorySlug);
    if (!category) throw new Error(`missing category ${categorySlug}`);
    const imageUrls: string[] = [];
    for (const src of sources) {
      try {
        imageUrls.push(await download(src));
      } catch (e) {
        console.log(`  image failed (${(e as Error).message}): ${src.split("?")[0]}`);
      }
    }
    if (!imageUrls.length) {
      console.log(`skipped ${name}: no image could be downloaded`);
      continue;
    }
    await prisma.product.create({
      data: {
        slug: `${slugify(name)}-${randomBytes(3).toString("hex")}`,
        name,
        description,
        basePrice: new Prisma.Decimal(price),
        stock: p.variants.some((v) => v.available) ? STOCK : 0,
        sku: p.variants[0].sku || null,
        categoryId: category.id,
        vendorId: store!.id,
        approvalStatus: ProductApprovalStatus.APPROVED,
        approvedAt: new Date(),
        displayOnStorefront: true,
        availableForSale: true,
        metadata: {},
        source: SOURCE,
        sourceRef: p.handle,
        images: { create: imageUrls.map((url, i) => ({ url, sortOrder: i })) },
      },
    });
    console.log(`created ${name} (Rs ${price}, ${imageUrls.length} images)`);
  }
}

main().finally(() => prisma.$disconnect());
