// Deletes ALL products (with their images, variants, carts, favourites and view history) and all
// categories, then recreates the category tree from prisma/seed-categories.ts.
// For clearing dummy data before a fresh import. Refuses to run if any order exists.
//
//   npx tsx scripts/reset-catalog.ts            # show what would be deleted
//   npx tsx scripts/reset-catalog.ts --confirm  # do it
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { deleteStoredMedia } from "../src/lib/storage";
import { seedCategories } from "../prisma/seed-categories";

async function main() {
  const confirm = process.argv.includes("--confirm");
  const counts = {
    products: await prisma.product.count(),
    images: await prisma.productImage.count(),
    videos: await prisma.productVideo.count(),
    cartItems: await prisma.cartItem.count(),
    viewEvents: await prisma.productViewEvent.count(),
    categories: await prisma.category.count(),
    orderItems: await prisma.orderItem.count(),
    categoryCommissionRules: await prisma.commissionRule.count({ where: { categoryId: { not: null } } }),
  };
  console.log("Current catalog:", counts);
  if (counts.orderItems || counts.categoryCommissionRules) {
    throw new Error("Orders or category commission rules exist; this script is only for clearing dummy data.");
  }
  if (!confirm) {
    console.log("\nDry run. Re-run with --confirm to delete the above and recreate the category tree.");
    return;
  }

  const media = [
    ...(await prisma.productImage.findMany({ select: { url: true } })),
    ...(await prisma.productVideo.findMany({ select: { url: true } })),
  ].map((m) => m.url);

  await prisma.$transaction(async (tx) => {
    // Rows that reference products without cascading go first.
    await tx.cartItem.deleteMany({});
    await tx.productViewEvent.deleteMany({});
    // Images, videos, variants, favourites and recommendation events cascade.
    await tx.product.deleteMany({});
    // Subcategories before their parents; category fields cascade.
    await tx.category.deleteMany({ where: { parentId: { not: null } } });
    await tx.category.deleteMany({});
  });

  let removed = 0;
  for (const url of new Set(media)) if (await deleteStoredMedia(url)) removed++;
  console.log(`Deleted ${counts.products} products, ${counts.categories} categories and ${removed} uploaded files.`);

  await seedCategories(prisma);
  const roots = await prisma.category.count({ where: { parentId: null } });
  const total = await prisma.category.count();
  console.log(`Created ${roots} main categories and ${total - roots} subcategories.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
