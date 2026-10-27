// Imports a Markaz product export into the house store, as "Pending review" listings.
//
//   npx tsx scripts/import-markaz.ts <export.xlsx> [--dry-run] [--stock 50] [--hide-stock] [--store "Marketplace Store"]
//
// Safe to re-run with a newer export: already-imported products only get their prices refreshed.
import "dotenv/config";
import { readFile } from "fs/promises";
import { prisma } from "../src/lib/db";
import { readFirstSheet } from "../src/lib/importers/xlsx";
import { ensureHouseStore, importMarkazProducts, parseShopifyRows } from "../src/lib/importers/markaz";
import { seedCategories } from "../prisma/seed-categories";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

/** seedCategories never changes existing rows; add new list options it defines (e.g. sizes). */
async function addMissingSizeOptions() {
  const sizes = await prisma.categoryAttribute.findMany({
    where: { key: "size", dataType: "select", category: { slug: { in: ["womens-fashion", "mens-fashion"] } } },
  });
  for (const a of sizes) {
    const missing = ["Free Size", "Unstitched"].filter((o) => !a.options.includes(o));
    if (missing.length) await prisma.categoryAttribute.update({ where: { id: a.id }, data: { options: [...a.options, ...missing] } });
  }
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) throw new Error("Usage: npx tsx scripts/import-markaz.ts <export.xlsx> [--dry-run] [--stock 50]");
  if (!/\.xlsx$/i.test(file)) throw new Error("Export the products from Markaz as Excel (.xlsx)");
  const dryRun = process.argv.includes("--dry-run");
  // --hide-stock: shoppers see only "In stock", not the quantity.
  const showStockCount = !process.argv.includes("--hide-stock");
  const stockPerItem = Number(arg("--stock") ?? 50);
  if (!Number.isInteger(stockPerItem) || stockPerItem < 0) throw new Error("--stock must be a whole number");

  const products = parseShopifyRows(readFirstSheet(await readFile(file)));
  console.log(`${products.length} products in ${file}${dryRun ? " (dry run: no products are saved)" : ""}\n`);

  // Categories the import maps to (idempotent, so also done for a dry run).
  await seedCategories(prisma);
  await addMissingSizeOptions();
  const store = dryRun
    ? ((await prisma.vendorProfile.findFirst({ where: { user: { email: "house-store@marketplace.internal" } } })) ?? { id: "dry-run" })
    : await ensureHouseStore(arg("--store") ?? "Marketplace Store");

  const results = await importMarkazProducts(products, { vendorId: store.id, stockPerItem, showStockCount, dryRun, log: console.log });
  const count = (a: string) => results.filter((r) => r.action === a).length;
  console.log(`\n${count("created")} created, ${count("updated")} updated, ${count("skipped")} skipped.`);
  if (!dryRun && count("created")) console.log("New products are in Admin → Products → Pending review.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
