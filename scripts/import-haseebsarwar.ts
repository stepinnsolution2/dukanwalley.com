// One-off (2026-10-31): first import of haseebsarwarclothing.com's ready-to-wear men's shalwar
// kameez, from their Shopify store's public product feed. Prices are their current sale prices;
// names and descriptions are written here from the product facts, not copied. Colours missing
// from their descriptions were read from the photos.
//
// Products are created HIDDEN (not on the storefront): the supplier's photos carry their logo and
// collar label, and shoppers must only ever see the store as PUBLIC_NAME. Publish them once clean
// photos (or the supplier's OK to cover the logo) are in. Their size-chart image names them, so
// it is never copied; its measurements are written into each description instead.
//
// Re-running refreshes prices and "was" prices of products already imported.
//
//   npx tsx scripts/import-haseebsarwar.ts            (add --dry-run to only print)
import "dotenv/config";
import { randomBytes } from "crypto";
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/slug";
import { saveUpload } from "../src/lib/storage";
import { uniqueVendorSlug } from "../src/lib/vendor-slug";
import { syncProductVariants, validateVariants } from "../src/lib/catalog";
import { Prisma } from "../src/generated/prisma/client";
import { KycStatus, ProductApprovalStatus, UserRole, VendorRestriction } from "../src/generated/prisma/enums";

const FEED = "https://haseebsarwarclothing.com/collections/ready-to-wear-shalwar-kameez-for-men/products.json?limit=250";
const SOURCE = "haseebsarwar";
const STORE_NAME = "haseebsarwarclothing.com";
const STORE_EMAIL = "haseebsarwar-store@marketplace.internal";
const STORE_PHONE = "+923245199606";
const PUBLIC_NAME = "Hassaine Clothing";
const STOCK_PER_SIZE = 10;
const MAX_IMAGES = 8;
const DRY = process.argv.includes("--dry-run");

type ShopifyProduct = {
  handle: string;
  title: string;
  body_html: string;
  variants: { price: string; compare_at_price: string | null; option1: string; available: boolean }[];
  images: { src: string; width: number; height: number }[];
};

/**
 * Per supplier code: colour (from their description, else read from the photos), a detail that
 * tells same-coloured suits apart, and the collar.
 */
const LOOKS: Record<string, { colour: string; detail?: string; collar?: "ban" }> = {
  RTW17: { colour: "Steel Grey", detail: "Charcoal Collar & Cuffs" },
  RTW60: { colour: "Jet Black", collar: "ban" },
  RTW15: { colour: "White", detail: "Contrast Collar Trim" },
  RTW1: { colour: "Charcoal", detail: "Gold Stitch Detail" },
  RTOF6: { colour: "Off-White", detail: "Brown Placket Trim" },
  RTW83: { colour: "Dark Green" },
  RTW41: { colour: "Charcoal", detail: "Grey Contrast Collar" },
  RTW87: { colour: "Boski Cream" },
  RTW18: { colour: "Light Grey", detail: "Navy Cuff Detail" },
  RTW11: { colour: "Mint Green", detail: "Striped Collar Trim" },
  RTW81: { colour: "Navy Blue" },
  RTW84: { colour: "Dark Brown" },
  RTW86: { colour: "Electric Blue" },
  RTW23: { colour: "White", detail: "Navy Cuff Detail" },
  RTW49: { colour: "Black", detail: "Red & Blue Contrast Collar" },
  RTW12: { colour: "White", detail: "Black Piping" },
  RTW5: { colour: "Olive Green", detail: "Patterned Placket Trim" },
  RTW85: { colour: "Coffee Brown" },
  RTW65: { colour: "Purple", collar: "ban" },
};

const SIZES = ["S", "M", "L", "XL"] as const;
// From the supplier's size chart, in inches.
const CHART: Record<(typeof SIZES)[number], { length: number; chest: number; waist: number; shoulders: number; sleeves: number; neck: number; shalwar: number }> = {
  S: { length: 41, chest: 21.5, waist: 20.5, shoulders: 17.5, sleeves: 23.5, neck: 14.5, shalwar: 41 },
  M: { length: 42, chest: 22.5, waist: 21.5, shoulders: 18.5, sleeves: 24.5, neck: 15.5, shalwar: 42 },
  L: { length: 43, chest: 24, waist: 23, shoulders: 19.5, sleeves: 25.5, neck: 16.5, shalwar: 43 },
  XL: { length: 44, chest: 25.5, waist: 25, shoulders: 20, sleeves: 26, neck: 17.5, shalwar: 44 },
};

const DELIVERY = `Sold by ${PUBLIC_NAME} on DukanWalley. Free delivery to Punjab, KPK, Sindh and Islamabad, usually within 3 working days, with cash on delivery.`;

const codeOf = (p: ShopifyProduct) => p.title.split(" - ").pop()!.trim().toUpperCase();
const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

function write(p: ShopifyProduct) {
  const code = codeOf(p);
  const look = LOOKS[code];
  if (!look) throw new Error(`no colour for ${code}: ${p.title}`);
  const text = plain(p.body_html);
  const kurta = /kurta/i.test(p.title);
  const washWear = /wash\s*&\s*wear/i.test(text);
  const blended = /blended/i.test(text);
  const fabric = washWear ? "Wash & Wear" : blended ? "Blended" : null;

  const name = kurta
    ? `Men's ${look.colour} Embroidered Kurta with White Trouser`
    : `Men's ${look.colour} ${washWear ? "Wash & Wear " : ""}Shalwar Kameez${look.detail ? ` with ${look.detail}` : ""}`;

  const intro = kurta
    ? `A ready-to-wear ${look.colour.toLowerCase()} kurta for men with a ban (mandarin) collar and thread embroidery down the placket, paired with a stitched white trouser.`
    : `A ready-to-wear ${look.colour.toLowerCase()} shalwar kameez for men, stitched and ready to put on, with ${
        look.collar === "ban" ? "a ban (mandarin) collar" : "a shirt-style collar"
      }${look.detail ? ` and ${look.detail.toLowerCase()}` : ""}.`;
  const features = [
    "Ready to wear: stitched, so there's no tailoring to arrange",
    "Hand-worked detailing, quality buttons and neat stitching",
    ...(fabric === "Wash & Wear" ? ["Wash & wear fabric that is easy to care for and stays smart through the day"] : []),
    "Comfortable in all seasons",
    "Sizes S, M, L and XL: compare your own measurements with the size chart before choosing",
  ];
  const facts: [string, string][] = [
    ["Type", kurta ? "Ready-to-wear kurta & trouser" : "Ready-to-wear shalwar kameez (stitched)"],
    ["Colour", look.colour],
    ...(fabric ? ([["Fabric", fabric]] as [string, string][]) : []),
    ["Collar", look.collar === "ban" ? "Ban (mandarin)" : "Shirt collar"],
    ["Season", "All seasons"],
  ];
  const chart = [
    `| Measurement (inches) | ${SIZES.join(" | ")} |`,
    `|---|${SIZES.map(() => "---").join("|")}|`,
    ...(
      [
        ["Kameez length", "length"],
        ["Chest (across, laid flat)", "chest"],
        ["Waist (across, laid flat)", "waist"],
        ["Shoulders", "shoulders"],
        ["Sleeves", "sleeves"],
        ["Neck", "neck"],
        [kurta ? "Trouser length" : "Shalwar length", "shalwar"],
      ] as const
    ).map(([label, key]) => `| ${label} | ${SIZES.map((s) => CHART[s][key]).join(" | ")} |`),
  ].join("\n");

  // Markdown with "## " sections, so the product page shows it in its tabbed layout.
  const description = [
    `${intro} A good choice for Jummah, Eid, office wear and family occasions.`,
    `## Features\n\n${features.map((f) => `- ${f}`).join("\n")}`,
    `## Size chart\n\nMeasurements of the garment in inches.\n\n${chart}`,
    `## Specifications\n\n${facts.map(([k, v]) => `- **${k}:** ${v}`).join("\n")}`,
    `## Delivery\n\n${DELIVERY}`,
  ].join("\n\n");
  return { code, name, description, colour: look.colour, fabric, categorySlug: kurta ? "mens-fashion-kurtas" : "mens-fashion-shalwar-kameez" };
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
          displayName: PUBLIC_NAME,
          slug: await uniqueVendorSlug(PUBLIC_NAME),
          phone: STORE_PHONE,
          addressLine1: "-",
          market: "PK",
          kycStatus: KycStatus.APPROVED,
          restriction: VendorRestriction.NONE,
          verificationNotes: "Created for the first import from haseebsarwarclothing.com (2026-10-31).",
        },
      },
    },
    include: { vendorProfile: true },
  });
  console.log(`created store "${STORE_NAME}" (shown as "${PUBLIC_NAME}")`);
  return user.vendorProfile!;
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
  const res = await fetch(FEED, { headers: { "user-agent": "DukanWalley catalogue import" } });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const { products: feed } = (await res.json()) as { products: ShopifyProduct[] };
  console.log(`${feed.length} products in the feed${DRY ? " (dry run)" : ""}`);
  const store = await ensureStore();
  const categories = new Map((await prisma.category.findMany()).map((c) => [c.slug, c]));

  for (const p of feed) {
    const { code, name, description, colour, fabric, categorySlug } = write(p);
    const category = categories.get(categorySlug);
    if (!category) throw new Error(`missing category ${categorySlug}`);
    const price = Math.round(Math.min(...p.variants.map((v) => Number(v.price))));
    const was = Math.round(Number(p.variants.find((v) => Math.round(Number(v.price)) === price)?.compare_at_price));
    const compareAtPrice = was > price ? new Prisma.Decimal(was) : null;

    const existing = await prisma.product.findUnique({ where: { source_sourceRef: { source: SOURCE, sourceRef: code } } });
    if (existing) {
      if (!DRY) await prisma.product.update({ where: { id: existing.id }, data: { basePrice: new Prisma.Decimal(price), compareAtPrice } });
      console.log(`updated ${name}: Rs ${existing.basePrice} → ${price}${compareAtPrice ? ` (was ${was})` : ""}`);
      continue;
    }

    // Sizes as offered; a size the supplier marks sold out gets no stock.
    const variants = await validateVariants(
      category.id,
      "PK",
      SIZES.map((s) => {
        const v = p.variants.find((x) => x.option1.trim().toUpperCase() === s);
        if (!v) throw new Error(`${code}: no size ${s}`);
        return { options: { size: s, color: colour }, stock: v.available ? STOCK_PER_SIZE : 0, price: Math.round(Number(v.price)) === price ? null : Math.round(Number(v.price)) };
      }),
    );
    if (!variants.ok) throw new Error(`${code}: ${variants.error}`);

    // Their size chart (a small landscape image) names the supplier: never copy it.
    const sources = p.images.filter((i) => !(i.width > i.height && i.width <= 800)).slice(0, MAX_IMAGES).map((i) => i.src);
    if (DRY) {
      console.log(`\n=== ${code} → ${name} | ${categorySlug} | Rs ${price}${compareAtPrice ? ` (was ${was})` : ""} | ${sources.length} images\n${description}`);
      continue;
    }
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
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug: `${slugify(name)}-${randomBytes(3).toString("hex")}`,
          name,
          description,
          basePrice: new Prisma.Decimal(price),
          compareAtPrice,
          stock: 0,
          showStockCount: false,
          categoryId: category.id,
          vendorId: store!.id,
          approvalStatus: ProductApprovalStatus.APPROVED,
          approvedAt: new Date(),
          // Hidden until the photos are cleared of the supplier's branding (see top).
          displayOnStorefront: false,
          availableForSale: false,
          metadata: fabric ? { fabric } : {},
          source: SOURCE,
          sourceRef: code,
          images: { create: imageUrls.map((url, i) => ({ url, sortOrder: i })) },
        },
      });
      await syncProductVariants(tx, product.id, variants.variants);
    });
    console.log(`created ${name} (Rs ${price}, ${imageUrls.length} images, hidden)`);
  }
}

main().finally(() => prisma.$disconnect());
