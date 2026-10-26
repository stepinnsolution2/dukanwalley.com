import Image from "next/image";
import Link from "next/link";
import { AutoScroller } from "@/components/auto-scroller";
import { prisma } from "@/lib/db";
import { canOptimizeImage } from "@/lib/media-url";

// Home page "Shop by category": the categories the owner featured (Admin › Categories), as
// pastel tiles. Categories without an uploaded image show the placeholder.

const PLACEHOLDER = "/category-placeholder.svg";
/** Soft tile colours, cycled so neighbours differ. */
const TINTS = [
  "bg-rose-100",
  "bg-amber-100",
  "bg-violet-100",
  "bg-emerald-100",
  "bg-sky-100",
  "bg-orange-100",
  "bg-fuchsia-100",
  "bg-lime-100",
  "bg-indigo-100",
  "bg-teal-100",
];

export async function CategoryTiles() {
  const categories = await prisma.category.findMany({
    where: { showOnHome: true },
    select: { id: true, name: true, slug: true, imageUrl: true },
    orderBy: [{ homeOrder: "asc" }, { name: "asc" }],
    take: 30,
  });
  if (!categories.length) return null;

  return (
    <section aria-labelledby="shop-by-category">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="shop-by-category" className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
            Shop by category
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">Browse {categories.length} categories from verified sellers</p>
        </div>
        <Link href="/products" className="shrink-0 text-sm font-semibold text-zinc-900 hover:underline">
          See all →
        </Link>
      </div>
      {/* One line that slides slowly right to left (and can be swiped). */}
      <AutoScroller label="Categories" className="-mx-3 mt-3 px-3 py-1.5 sm:mx-0 sm:px-0">
        {categories.map((c, i) => {
          const src = c.imageUrl ?? PLACEHOLDER;
          return (
            <div key={c.id} className="w-24 shrink-0 sm:w-28">
              <Link href={`/category/${c.slug}`} className="group flex flex-col items-center text-center">
                <span
                  className={`relative block aspect-square w-full max-w-28 overflow-hidden rounded-[28%] ${TINTS[i % TINTS.length]} shadow-sm ring-4 ring-white transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md`}
                >
                  <Image
                    src={src}
                    alt={c.name}
                    fill
                    sizes="112px"
                    unoptimized={!canOptimizeImage(src)}
                    // Uploads are already square with built-in margins, so they fill the rounded tile.
                    className={c.imageUrl ? "object-cover" : "object-contain p-[14%] opacity-90"}
                  />
                </span>
                <span className="mt-2 line-clamp-2 text-xs font-semibold leading-snug text-zinc-800 group-hover:text-zinc-950 sm:text-sm">
                  {c.name}
                </span>
              </Link>
            </div>
          );
        })}
      </AutoScroller>
    </section>
  );
}
