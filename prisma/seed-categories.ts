// Category tree, descriptions and category fields. Idempotent: creates what's missing and fills
// empty descriptions, but never overwrites admin edits. Used by seed.ts and the Markaz importer;
// run on its own with `npx tsx prisma/seed-categories.ts`.
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/slug";

type Attr = { key: string; name: string; dataType: string; required: boolean; options?: string[]; isVariant?: boolean };
type Sub = { name: string; slug?: string; description: string; attributes?: Attr[] };
type Cat = { name: string; slug: string; description: string; attributes?: Attr[]; children: Sub[] };

const color: Attr = { key: "color", name: "Color", dataType: "text", required: false, isVariant: true };
const brand = (required: boolean): Attr => ({ key: "brand", name: "Brand", dataType: "text", required });
const material: Attr = { key: "material", name: "Material", dataType: "text", required: false };
const fabric: Attr = { key: "fabric", name: "Fabric", dataType: "text", required: false };

export const CATEGORIES: Cat[] = [
  {
    name: "Women's Fashion",
    slug: "womens-fashion",
    description:
      "Women's clothing from sellers across Pakistan: unstitched lawn and khaddar suits, ready-to-wear kurtas and co-ords, formal and bridal outfits, abayas, dupattas and western wear. Compare designs, fabrics and prices from different stores in one place, and check each listing's size chart and fabric details before you order.",
    attributes: [
      {
        key: "size",
        name: "Size",
        dataType: "select",
        required: true,
        // Free Size / Unstitched: common for Pakistani suits, sarees and nightwear.
        options: ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "Free Size", "Unstitched"],
        isVariant: true,
      },
      color,
      fabric,
      { key: "pieces", name: "Pieces", dataType: "select", required: false, options: ["1 Piece", "2 Piece", "3 Piece"] },
    ],
    children: [
      {
        name: "Unstitched Suits",
        slug: "womens-fashion-unstitched",
        description:
          "Unstitched 2-piece and 3-piece suits in lawn, cotton, khaddar, linen and karandi, ready for your own tailoring. Listings state the fabric and the shirt, dupatta and trouser lengths so you can compare like for like.",
      },
      {
        name: "Ready-to-Wear",
        slug: "womens-fashion-ready-to-wear",
        description:
          "Stitched kurtas, shalwar kameez, co-ord sets and everyday pret you can wear straight away. Check the size chart on each listing, as measurements differ between brands and sellers.",
      },
      {
        name: "Formal & Bridal",
        slug: "womens-fashion-formal-bridal",
        description:
          "Embroidered formals, party wear, sarees and bridal outfits for weddings, mehndi and Eid. Look at the close-up photos and fabric details to judge embellishment and work before you buy.",
      },
      {
        name: "Abayas & Hijabs",
        slug: "womens-fashion-abayas-hijabs",
        description:
          "Abayas, hijabs, niqabs and scarves in everyday and occasion styles. Listings give the length and fabric so you can choose the right fit and drape.",
      },
      {
        name: "Dupattas & Shawls",
        slug: "womens-fashion-dupattas-shawls",
        description:
          "Dupattas, stoles and shawls to complete an outfit, from light chiffon for summer to wool and pashmina-style shawls for winter.",
      },
      {
        name: "Western Wear",
        slug: "womens-fashion-western-wear",
        description: "Tops, dresses, jeans, trousers and jackets in western styles. Check sizes on each listing, as they follow the seller's own size chart.",
      },
      {
        name: "Nightwear & Loungewear",
        slug: "womens-fashion-nightwear",
        description: "Nightsuits, pyjama sets and comfortable loungewear for home, in cotton, jersey and other soft fabrics.",
      },
    ],
  },
  {
    name: "Men's Fashion",
    slug: "mens-fashion",
    description:
      "Men's clothing for everyday, office and occasions: shalwar kameez, kurtas, shirts and t-shirts, trousers and jeans, waistcoats and unstitched fabric. Compare styles and prices from several sellers and check each listing's size chart and fabric before ordering.",
    attributes: [
      {
        key: "size",
        name: "Size",
        dataType: "select",
        required: true,
        options: ["S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "Free Size", "Unstitched"],
        isVariant: true,
      },
      color,
      fabric,
    ],
    children: [
      {
        name: "Shalwar Kameez",
        slug: "mens-fashion-shalwar-kameez",
        description: "Stitched shalwar kameez suits in wash & wear, cotton and blended fabrics, for daily wear, Jummah and Eid.",
      },
      {
        name: "Kurtas",
        slug: "mens-fashion-kurtas",
        description: "Plain and embroidered kurtas to wear with shalwar, pyjama or jeans, from casual cotton to festive styles.",
      },
      {
        name: "Shirts & T-Shirts",
        slug: "mens-fashion-shirts-t-shirts",
        description: "Formal and casual shirts, polos and t-shirts. Fit (slim or regular) and fabric are given on each listing.",
      },
      {
        name: "Trousers & Jeans",
        slug: "mens-fashion-trousers-jeans",
        description: "Jeans, chinos, dress trousers and joggers. Check the waist and length measurements on each listing.",
      },
      {
        name: "Waistcoats & Jackets",
        slug: "mens-fashion-waistcoats-jackets",
        description: "Waistcoats for weddings and formal events, plus jackets, hoodies and sweatshirts for winter.",
      },
      {
        name: "Unstitched Fabric",
        slug: "mens-fashion-unstitched-fabric",
        description: "Unstitched suit fabric for men in wash & wear, cotton, khaddar and boski-style cloth, usually sold by the suit length.",
      },
      {
        name: "Shawls",
        slug: "mens-fashion-shawls",
        description: "Men's wool and pashmina-style shawls (chadar) for winter, weddings and everyday wear. Listings give the fabric, colour and length.",
      },
    ],
  },
  {
    name: "Kids & Baby",
    slug: "kids-baby",
    description:
      "Clothing for girls and boys, baby care essentials, and toys and games. Each listing gives the age range or size so you can choose the right fit, and toys show the recommended age.",
    attributes: [
      { key: "size", name: "Size / age", dataType: "text", required: false, isVariant: true },
      color,
    ],
    children: [
      { name: "Girls' Clothing", slug: "kids-baby-girls-clothing", description: "Frocks, suits, tops and party wear for girls, listed by age range." },
      { name: "Boys' Clothing", slug: "kids-baby-boys-clothing", description: "Shalwar kameez, shirts, t-shirts and trousers for boys, listed by age range." },
      {
        name: "Baby Care",
        slug: "kids-baby-baby-care",
        description: "Everyday baby essentials such as feeding, bathing and bedding items, and baby clothing.",
      },
      {
        name: "Toys & Games",
        slug: "kids-baby-toys-games",
        description: "Toys, puzzles, educational and outdoor games. Check the recommended age on each listing.",
      },
    ],
  },
  {
    name: "Shoes",
    slug: "shoes",
    description:
      "Shoes for women, men and kids: sneakers, sandals, formal shoes, khussa and Peshawari chappal, and sports shoes. Listings show the available sizes in stock, so check the size guide and choose the size you normally wear.",
    attributes: [
      { key: "size", name: "Size", dataType: "text", required: true, isVariant: true },
      color,
      {
        key: "style",
        name: "Style",
        dataType: "select",
        required: false,
        options: ["Sneakers", "Running & Sports", "Casual", "Formal", "Sandals & Slippers", "Heels", "Boots", "Peshawari & Khussa"],
      },
    ],
    children: [
      { name: "Women's Shoes", slug: "shoes-women", description: "Heels, flats, khussa, sandals, slippers and sneakers for women." },
      { name: "Men's Shoes", slug: "shoes-men", description: "Formal shoes, loafers, Peshawari chappal, sandals and sneakers for men." },
      { name: "Kids' Shoes", slug: "shoes-kids", description: "School shoes, sandals and sneakers for girls and boys." },
      { name: "Sports Shoes", slug: "shoes-sports", description: "Running, training and sports shoes for workouts, games and daily walking." },
    ],
  },
  {
    name: "Bags & Accessories",
    slug: "bags-accessories",
    description:
      "Handbags, clutches, wallets, backpacks, belts and sunglasses. Listings give the material and dimensions, so you can check the size and what a bag will hold before ordering.",
    attributes: [color, material],
    children: [
      { name: "Handbags", slug: "bags-accessories-handbags", description: "Shoulder bags, totes, clutches and crossbody bags for everyday use and occasions." },
      { name: "Wallets", slug: "bags-accessories-wallets", description: "Wallets and card holders for men and women." },
      { name: "Backpacks", slug: "bags-accessories-backpacks", description: "Backpacks for school, university, work and travel, including laptop backpacks." },
      { name: "Belts", slug: "bags-accessories-belts", description: "Leather and casual belts. Check the length and buckle style on each listing." },
      { name: "Sunglasses", slug: "bags-accessories-sunglasses", description: "Sunglasses in different frame styles for men and women." },
    ],
  },
  {
    name: "Jewellery & Watches",
    slug: "jewellery-watches",
    description:
      "Earrings, necklace sets, rings, bangles and bracelets, plus watches for men and women. Most fashion jewellery is artificial; each listing states the material, so check it before you buy.",
    attributes: [material, color],
    children: [
      { name: "Earrings", slug: "jewellery-watches-earrings", description: "Studs, jhumkas, hoops and drop earrings for daily wear and occasions." },
      { name: "Necklaces & Sets", slug: "jewellery-watches-necklaces-sets", description: "Necklaces, chokers and jewellery sets, including bridal and party sets." },
      { name: "Rings", slug: "jewellery-watches-rings", description: "Rings in different styles and sizes; check the size or whether a ring is adjustable." },
      { name: "Bangles & Bracelets", slug: "jewellery-watches-bangles-bracelets", description: "Bangles, kangans and bracelets, sold as single pieces or sets." },
      {
        name: "Men's Watches",
        slug: "jewellery-watches-mens-watches",
        description: "Analogue, digital and smart-style watches for men. Listings give the strap material and dial size.",
      },
      {
        name: "Women's Watches",
        slug: "jewellery-watches-womens-watches",
        description: "Watches for women, from slim everyday designs to bracelet-style watches.",
      },
    ],
  },
  {
    name: "Beauty & Personal Care",
    slug: "beauty-personal-care",
    description:
      "Makeup, skincare, hair care, fragrances and men's grooming. Each listing names the brand and size or volume; check the ingredients and expiry information given by the seller.",
    attributes: [
      brand(false),
      { key: "size_volume", name: "Size / volume", dataType: "text", required: false },
      { key: "color", name: "Shade / colour", dataType: "text", required: false, isVariant: true },
    ],
    children: [
      { name: "Makeup", slug: "beauty-personal-care-makeup", description: "Foundation, lipstick, eye makeup, nail polish and makeup tools." },
      { name: "Skincare", slug: "beauty-personal-care-skincare", description: "Cleansers, moisturisers, serums and sunscreen for different skin types." },
      { name: "Hair Care", slug: "beauty-personal-care-hair-care", description: "Shampoo, conditioner, hair oil, treatments and styling products and tools." },
      { name: "Fragrances", slug: "beauty-personal-care-fragrances", description: "Perfumes, attars and body sprays for men and women." },
      { name: "Men's Grooming", slug: "beauty-personal-care-mens-grooming", description: "Trimmers, shaving products, beard care and grooming kits." },
    ],
  },
  {
    name: "Mobiles & Tablets",
    slug: "mobiles-tablets",
    description:
      "Smartphones, feature phones and tablets from different brands and sellers. Compare storage, RAM and prices, and check whether a phone is PTA approved, which listings state, before you buy.",
    attributes: [
      brand(true),
      { key: "storage_gb", name: "Storage (GB)", dataType: "select", required: false, options: ["16", "32", "64", "128", "256", "512", "1024"] },
      { key: "ram_gb", name: "RAM (GB)", dataType: "select", required: false, options: ["2", "3", "4", "6", "8", "12", "16"] },
      { key: "pta_approved", name: "PTA approved", dataType: "boolean", required: false },
      color,
    ],
    children: [
      { name: "Smartphones", slug: "mobiles-tablets-smartphones", description: "Android phones and iPhones. Compare storage, RAM, camera and battery details listed by each seller." },
      { name: "Feature Phones", slug: "mobiles-tablets-feature-phones", description: "Keypad phones with long battery life for calls and texts." },
      { name: "Tablets", slug: "mobiles-tablets-tablets", description: "Tablets for study, work and entertainment, with Wi-Fi or SIM support as listed." },
    ],
  },
  {
    name: "Mobile Accessories",
    slug: "mobile-accessories",
    description:
      "Cases and covers, chargers and cables, earphones, power banks and smart watches. Check that an accessory is compatible with your phone model and charging port before ordering.",
    attributes: [brand(false), { key: "compatible_with", name: "Compatible with", dataType: "text", required: false }, color],
    children: [
      { name: "Cases & Covers", slug: "mobile-accessories-cases-covers", description: "Phone cases, covers and screen protectors, listed by phone model." },
      { name: "Chargers & Cables", slug: "mobile-accessories-chargers-cables", description: "Wall chargers, fast chargers, car chargers and USB-C, Lightning and micro-USB cables." },
      { name: "Earphones & Headphones", slug: "mobile-accessories-earphones-headphones", description: "Wired earphones, wireless earbuds and headphones." },
      { name: "Power Banks", slug: "mobile-accessories-power-banks", description: "Portable power banks; compare capacity (mAh) and output listed by the seller." },
      { name: "Smart Watches", slug: "mobile-accessories-smart-watches", description: "Smart watches and fitness bands that pair with your phone." },
    ],
  },
  {
    name: "Laptops & Computers",
    slug: "laptops-computers",
    description:
      "Laptops for everyday use, business and gaming, plus desktops and monitors. Compare the processor, RAM, storage and screen size listed on each product, and check whether it is new or used as stated by the seller.",
    attributes: [
      brand(true),
      { key: "processor", name: "Processor", dataType: "text", required: false },
      { key: "ram_gb", name: "RAM (GB)", dataType: "number", required: false },
      { key: "storage_gb", name: "Storage (GB)", dataType: "number", required: false },
      { key: "condition", name: "Condition", dataType: "select", required: false, options: ["New", "Used", "Refurbished"] },
    ],
    children: [
      { name: "Everyday Laptops", slug: "laptops-computers-everyday", description: "Laptops for study, browsing, office work and video calls." },
      { name: "Business Laptops", slug: "laptops-computers-business", description: "Durable laptops built for work, with business-grade features listed by the seller." },
      { name: "Gaming Laptops", slug: "laptops-computers-gaming", description: "Laptops with dedicated graphics and faster displays for gaming and creative work." },
      { name: "Desktops", slug: "laptops-computers-desktops", description: "Desktop PCs and all-in-ones for home and office." },
      { name: "Monitors", slug: "laptops-computers-monitors", description: "Monitors for work and gaming; compare size, resolution and refresh rate." },
    ],
  },
  {
    name: "Computer Accessories",
    slug: "computer-accessories",
    description:
      "Mice, keyboards, storage, laptop bags, chargers and networking gear. Check compatibility with your laptop or computer, such as ports and charger wattage, on each listing.",
    attributes: [brand(false)],
    children: [
      { name: "Mice & Keyboards", slug: "computer-accessories-mice-keyboards", description: "Wired and wireless mice, keyboards and combos." },
      { name: "Storage", slug: "computer-accessories-storage", description: "USB flash drives, external hard drives, SSDs and memory cards." },
      { name: "Bags & Sleeves", slug: "computer-accessories-bags-sleeves", description: "Laptop bags, backpacks and sleeves; check the laptop size each one fits." },
      { name: "Chargers & Adapters", slug: "computer-accessories-chargers-adapters", description: "Laptop chargers, USB-C adapters and hubs." },
      { name: "Networking", slug: "computer-accessories-networking", description: "Wi-Fi routers, range extenders, network cables and adapters." },
    ],
  },
  {
    name: "Electronics",
    slug: "electronics",
    description:
      "TVs, audio and speakers, cameras and gaming. Each listing gives the brand and key specifications so you can compare models and prices from different sellers.",
    attributes: [brand(false)],
    children: [
      { name: "TV & Video", slug: "electronics-tv-video", description: "LED and smart TVs, Android TV boxes and streaming devices; compare screen size and resolution." },
      { name: "Audio & Speakers", slug: "electronics-audio-speakers", description: "Bluetooth speakers, soundbars, home audio and headphones." },
      { name: "Cameras", slug: "electronics-cameras", description: "Cameras, action cameras, security cameras and camera accessories." },
      { name: "Gaming", slug: "electronics-gaming", description: "Gaming consoles, controllers and gaming accessories." },
    ],
  },
  {
    name: "Home & Kitchen",
    slug: "home-kitchen",
    description:
      "Kitchenware, home décor, bedding and small appliances for every room. Listings give sizes, materials and, for appliances, the power rating, so you can check what fits your home.",
    attributes: [color, material],
    children: [
      { name: "Kitchenware", slug: "home-kitchen-kitchenware", description: "Cookware, utensils, storage containers, dinner sets and kitchen tools." },
      { name: "Home Décor", slug: "home-kitchen-home-decor", description: "Wall décor, lamps, cushions, rugs and decorative pieces." },
      { name: "Bedding", slug: "home-kitchen-bedding", description: "Bedsheets, duvets, pillows and blankets; check the bed size on each listing." },
      {
        name: "Small Appliances",
        slug: "home-kitchen-small-appliances",
        description: "Blenders, irons, kettles, air fryers and other home appliances, with power and capacity listed by the seller.",
      },
    ],
  },
  {
    name: "Sports & Fitness",
    slug: "sports-fitness",
    description:
      "Sportswear, fitness equipment, cricket gear and outdoor and cycling products. Compare sizes, weights and materials listed by each seller to find gear that suits your sport.",
    attributes: [brand(false), color],
    children: [
      {
        name: "Sportswear",
        slug: "sports-fitness-sportswear",
        description: "Tracksuits, gym wear, sports t-shirts and shorts for training and play.",
        attributes: [{ key: "size", name: "Size", dataType: "select", required: true, options: ["XS", "S", "M", "L", "XL", "XXL"], isVariant: true }],
      },
      { name: "Fitness Equipment", slug: "sports-fitness-fitness-equipment", description: "Dumbbells, resistance bands, yoga mats and home gym equipment." },
      { name: "Cricket", slug: "sports-fitness-cricket", description: "Bats, balls, pads, gloves and cricket kits for tape-ball and hard-ball cricket." },
      { name: "Outdoor & Cycling", slug: "sports-fitness-outdoor-cycling", description: "Bicycles, cycling accessories, camping and outdoor gear." },
    ],
  },
];

/** Every slug the tree defines (parents and subcategories). */
export function categoryTreeSlugs() {
  return CATEGORIES.flatMap((c) => [c.slug, ...c.children.map((s) => s.slug ?? `${c.slug}-${slugify(s.name)}`)]);
}

async function upsertCategory(
  prisma: PrismaClient,
  data: { name: string; slug: string; description: string; parentId?: string; homeOrder?: number },
) {
  const existing = await prisma.category.findUnique({ where: { slug: data.slug } });
  if (!existing) {
    // Main categories start out featured on the home page, in tree order.
    const { homeOrder, ...rest } = data;
    return prisma.category.create({
      data: { ...rest, parentId: data.parentId ?? null, showOnHome: homeOrder !== undefined, homeOrder: homeOrder ?? 0 },
    });
  }
  // Keep admin edits; only fill a description that was never written.
  if (!existing.description) {
    return prisma.category.update({ where: { id: existing.id }, data: { description: data.description } });
  }
  return existing;
}

async function ensureAttributes(prisma: PrismaClient, categoryId: string, attrs: Attr[] = []) {
  for (const a of attrs) {
    await prisma.categoryAttribute.upsert({
      where: { categoryId_key: { categoryId, key: a.key } },
      update: {},
      create: { categoryId, options: [], ...a },
    });
  }
}

export async function seedCategories(prisma: PrismaClient) {
  for (const [i, c] of CATEGORIES.entries()) {
    const parent = await upsertCategory(prisma, { name: c.name, slug: c.slug, description: c.description, homeOrder: (i + 1) * 10 });
    await ensureAttributes(prisma, parent.id, c.attributes);
    // Subcategories inherit the parent's fields; slugs are parent-prefixed (shoes-men).
    for (const s of c.children) {
      const child = await upsertCategory(prisma, {
        name: s.name,
        slug: s.slug ?? `${c.slug}-${slugify(s.name)}`,
        description: s.description,
        parentId: parent.id,
      });
      await ensureAttributes(prisma, child.id, s.attributes);
    }
  }
}

// Run directly: npx tsx prisma/seed-categories.ts
if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed-categories.ts")) {
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) });
  seedCategories(prisma)
    .then(() => console.log("Categories seeded"))
    .finally(() => prisma.$disconnect());
}
