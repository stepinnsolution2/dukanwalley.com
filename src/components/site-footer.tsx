import Link from "next/link";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { prisma } from "@/lib/db";
import { categoryAndDescendantIds, storefrontProductWhere } from "@/lib/catalog";
import { getCurrentMarket } from "@/lib/market-session";
import { SITE_NAME } from "@/lib/seo";

/** Top-level categories that have something to buy in this market (directly or in a subcategory). */
async function shopCategories() {
  const [categories, counts] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true, slug: true, parentId: true }, orderBy: { name: "asc" } }),
    prisma.product.groupBy({ by: ["categoryId"], where: storefrontProductWhere(await getCurrentMarket()) }),
  ]);
  const withProducts = new Set(counts.map((c) => c.categoryId));
  return categories
    .filter((c) => !c.parentId && categoryAndDescendantIds(c.id, categories).some((id) => withProducts.has(id)))
    .slice(0, 16);
}

export async function SiteFooter() {
  const categories = await shopCategories();
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-zinc-900">Stay in the loop</p>
          <p className="text-sm text-zinc-600">Deals, new arrivals and price drops — no spam.</p>
        </div>
        <NewsletterSignup />
      </div>
      {categories.length ? (
        <nav aria-label="Shop by category" className="mx-auto max-w-[1600px] border-t border-zinc-100 px-3 py-5 sm:px-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Shop by category</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/category/${c.slug}`} className="hover:text-teal-700 hover:underline">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <div className="border-t border-zinc-100 py-4 text-center text-sm text-zinc-500">
        <Link href="/products" className="hover:underline">All products</Link>
        {" · "}
        <Link href="/sellers" className="hover:underline">Sellers</Link>
        {" · "}
        <Link href="/orders/track" className="hover:underline">Track an order</Link>
        {" · "}
        <Link href="/vendor/register" className="hover:underline">Sell with us</Link>
        <p className="mt-2 text-xs text-zinc-400">© {new Date().getFullYear()} {SITE_NAME}</p>
      </div>
    </footer>
  );
}
