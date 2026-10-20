// Category tree and category fields. Idempotent: creates what's missing, never overwrites
// admin edits. Used by seed.ts; run on its own with `npx tsx prisma/seed-categories.ts`.
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { slugify } from "../src/lib/slug";

type Attr = { key: string; name: string; dataType: string; required: boolean; options?: string[]; isVariant?: boolean };
type Cat = { name: string; slug: string; attributes?: Attr[]; children?: string[] };

const CATEGORIES: Cat[] = [
  {
    name: "Shoes",
    slug: "shoes",
    children: ["Men", "Women", "Kids"],
    attributes: [
      { key: "size", name: "Size", dataType: "text", required: true, isVariant: true },
      { key: "color", name: "Color", dataType: "text", required: false, isVariant: true },
      {
        key: "style",
        name: "Style",
        dataType: "select",
        required: false,
        options: ["Sneakers", "Running & Sports", "Casual", "Formal", "Sandals & Slippers", "Boots", "Peshawari & Khussa"],
      },
    ],
  },
  {
    name: "Garments",
    slug: "garments",
    children: ["Men", "Women", "Kids"],
    attributes: [
      {
        key: "size",
        name: "Size",
        dataType: "select",
        required: true,
        // Free Size / Unstitched: common for Pakistani suits, sarees and nightwear.
        options: ["XS", "S", "M", "L", "XL", "XXL", "Free Size", "Unstitched"],
        isVariant: true,
      },
      { key: "color", name: "Color", dataType: "text", required: false, isVariant: true },
      { key: "fabric", name: "Fabric", dataType: "text", required: false },
      {
        key: "type",
        name: "Type",
        dataType: "select",
        required: false,
        options: [
          "T-Shirts & Polos",
          "Shirts",
          "Trousers & Jeans",
          "Shalwar Kameez",
          "Kurtas",
          "Dresses",
          "Jackets & Hoodies",
          "Nightwear",
        ],
      },
    ],
  },
  {
    name: "Mobile Phone",
    slug: "mobile-phone",
    children: ["Smartphones", "Feature Phones"],
    attributes: [
      { key: "brand", name: "Brand", dataType: "text", required: true },
      { key: "storage_gb", name: "Storage (GB)", dataType: "select", required: true, options: ["64", "128", "256", "512", "1024"] },
      { key: "pta_approved", name: "PTA approved", dataType: "boolean", required: false },
    ],
  },
  {
    name: "Mobile Accessories",
    slug: "mobile-accessories",
    children: ["Chargers & Cables", "Cases & Covers", "Earphones & Headphones", "Power Banks", "Smart Watches"],
  },
  {
    name: "Laptop",
    slug: "laptop",
    children: ["Everyday", "Gaming", "Business"],
    attributes: [
      { key: "brand", name: "Brand", dataType: "text", required: true },
      { key: "ram_gb", name: "RAM (GB)", dataType: "number", required: true },
      { key: "storage_gb", name: "Storage (GB)", dataType: "number", required: false },
    ],
  },
  {
    name: "Laptop Accessories",
    slug: "laptop-accessories",
    children: ["Bags & Sleeves", "Mice & Keyboards", "Chargers & Adapters", "Storage"],
  },
  { name: "Jewellery", slug: "jewellery", children: ["Rings", "Necklaces & Sets", "Earrings"] },
  { name: "Bags", slug: "bags", children: ["Women's Handbags"] },
  { name: "Beauty", slug: "beauty", children: ["Makeup"] },
];

export async function seedCategories(prisma: PrismaClient) {
  for (const c of CATEGORIES) {
    const parent = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { name: c.name, slug: c.slug },
    });
    for (const a of c.attributes ?? []) {
      await prisma.categoryAttribute.upsert({
        where: { categoryId_key: { categoryId: parent.id, key: a.key } },
        update: {},
        create: { categoryId: parent.id, options: [], ...a },
      });
    }
    // Subcategories inherit the parent's fields; slugs are parent-prefixed (shoes-men).
    for (const name of c.children ?? []) {
      await prisma.category.upsert({
        where: { slug: `${c.slug}-${slugify(name)}` },
        update: {},
        create: { name, slug: `${c.slug}-${slugify(name)}`, parentId: parent.id },
      });
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
