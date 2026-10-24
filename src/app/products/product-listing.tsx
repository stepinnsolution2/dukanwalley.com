import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { FavoriteButton } from "@/components/favorite-button";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { categoryAndDescendantIds, inheritedAttributeDefs, storefrontProductWhere } from "@/lib/catalog";
import { getCurrentMarket } from "@/lib/market-session";
import { formatMoney, MARKETS } from "@/lib/markets";
import { canOptimizeImage } from "@/lib/media-url";
import { breadcrumbJsonLd, metaDescription, SITE_NAME, type Crumb } from "@/lib/seo";
import { isColorKey } from "@/lib/variants";
import type { Prisma } from "@/generated/prisma/client";
import { AutoSubmitForm } from "./auto-submit-form";
import { PAGE_WIDE } from "@/lib/page-layout";

const PAGE_SIZE = 24;

const SORTS = {
  featured: { label: "Featured", orderBy: [{ featuredPriority: "desc" }, { updatedAt: "desc" }] },
  newest: { label: "Newest", orderBy: [{ createdAt: "desc" }] },
  price_asc: { label: "Price: low to high", orderBy: [{ basePrice: "asc" }] },
  price_desc: { label: "Price: high to low", orderBy: [{ basePrice: "desc" }] },
} satisfies Record<string, { label: string; orderBy: Prisma.ProductOrderByWithRelationInput[] }>;
type SortKey = keyof typeof SORTS;

export type SP = Record<string, string | string[] | undefined>;

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
export const one = (v: string | string[] | undefined) => list(v)[0]?.trim() || undefined;

/**
 * Listing URL for a set of params: a category gets its own clean path (/category/shoes),
 * everything else stays in the query string (/category/shoes?size=41, /products?q=bag).
 */
export function listingHref(params: SP) {
  const category = one(params.category);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (k !== "category") for (const x of list(v)) qs.append(k, x);
  const base = category ? `/category/${encodeURIComponent(category)}` : "/products";
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * Title, canonical and robots for a listing. Only the plain listing (optionally paginated) is
 * indexable; search, filters and sort orders are noindex and point at the plain listing, so
 * crawlers don't index thousands of near-duplicate filter combinations.
 */
/** Any search, filter or sort param besides the listing's own keys (page, plus e.g. category). */
export function isFilteredListing(sp: SP, ownKeys: string[] = []) {
  return Object.entries(sp).some(([k, v]) => k !== "page" && !ownKeys.includes(k) && list(v).length);
}

export function listingMetadata(
  sp: SP,
  category?: {
    name: string;
    slug: string;
    parentName?: string | null;
    description?: string | null;
    /** No products listed yet: kept out of search results until it has some. */
    empty?: boolean;
  },
): Metadata {
  const page = Math.max(1, Math.trunc(Number(one(sp.page))) || 1);
  const base = category ? `/category/${category.slug}` : "/products";
  const q = one(sp.q);
  const filtered = isFilteredListing(sp, ["category"]);
  const pageSuffix = page > 1 ? ` – Page ${page}` : "";
  // "Unstitched Suits – Women's Fashion", but just "Women's Shoes" (the parent is already in the name).
  const parentWord = category?.parentName?.split(/[\s&]+/)[0]?.toLowerCase();
  const withParent = category?.parentName && parentWord && !category.name.toLowerCase().includes(parentWord);
  const title = q
    ? `Search results for “${q}”`
    : category
      ? `${category.name}${withParent ? ` – ${category.parentName}` : ""}${pageSuffix}`
      : `All products${pageSuffix}`;
  const description = category
    ? category.description
      ? metaDescription(category.description)
      : `Shop ${category.name.toLowerCase()} from multiple sellers on ${SITE_NAME}. Compare prices and order online.`
    : `Browse products from multiple sellers on ${SITE_NAME}. Compare prices and order online.`;
  return {
    title,
    description,
    alternates: { canonical: page > 1 && !filtered ? `${base}?page=${page}` : base },
    robots: filtered || category?.empty ? { index: false, follow: true } : undefined,
    // Setting openGraph replaces the layout's, so repeat the default share image.
    openGraph: { title, description, url: base, images: [{ url: "/logo.png", width: 800, height: 514, alt: SITE_NAME }] },
  };
}

/** Clothing sizes in wearing order, then shoe/number sizes numerically. */
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
function sortSizes(values: string[]) {
  return values.sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

/** Product grid with filters; shared by /products and /category/[slug] (sp.category set). */
export async function ProductListing({ sp }: { sp: SP }) {
  const market = await getCurrentMarket();
  const m = MARKETS[market];

  const q = one(sp.q);
  const zone = one(sp.zone);
  const sellerId = one(sp.seller);
  const categorySlug = one(sp.category);
  const min = Number(one(sp.min)) || undefined;
  const max = Number(one(sp.max)) || undefined;
  const sizes = list(sp.size);
  const colors = list(sp.color);
  const inStock = one(sp.stock) === "1";
  const sort: SortKey = (one(sp.sort) as SortKey) in SORTS ? (one(sp.sort) as SortKey) : "featured";
  const page = Math.max(1, Math.trunc(Number(one(sp.page))) || 1);

  // Category tree and the selected category (with everything under it).
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, slug: true, parentId: true, description: true },
    orderBy: { name: "asc" },
  });
  const current = categorySlug ? categories.find((c) => c.slug === categorySlug) : undefined;
  const seller = sellerId
    ? await prisma.vendorProfile.findUnique({ where: { id: sellerId }, select: { id: true, storeName: true } })
    : null;
  const scopeIds = current ? categoryAndDescendantIds(current.id, categories) : undefined;

  // Filterable list fields of the selected category, e.g. Style for shoes (from ?attr_style=).
  const attrDefs = current
    ? (await inheritedAttributeDefs(current.id)).filter((d) => !d.isVariant && d.dataType === "select")
    : [];
  const attrFilters = attrDefs
    .map((d) => ({ def: d, values: list(sp[`attr_${d.key}`]).filter((v) => d.options.includes(v)) }))
    .filter((a) => a.values.length);

  // Scope = market + search + category. Facets and counts are computed within it.
  const scope: Prisma.ProductWhereInput = {
    ...storefrontProductWhere(market),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(zone ? { zoneTags: { has: zone } } : {}),
    ...(sellerId ? { vendorId: sellerId } : {}),
  };
  const inCategory: Prisma.ProductWhereInput = scopeIds ? { ...scope, categoryId: { in: scopeIds } } : scope;

  const colorMatch = (c: string): Prisma.ProductVariantWhereInput[] => [
    { options: { path: ["color"], equals: c } },
    { options: { path: ["colour"], equals: c } },
  ];
  const where: Prisma.ProductWhereInput = {
    ...inCategory,
    AND: [
      ...(min ? [{ basePrice: { gte: min } }] : []),
      ...(max ? [{ basePrice: { lte: max } }] : []),
      ...(inStock ? [{ stock: { gt: 0 } }] : []),
      // Size and colour must be available together in one in-stock variant.
      ...(sizes.length || colors.length
        ? [
            {
              variants: {
                some: {
                  stock: { gt: 0 },
                  AND: [
                    ...(sizes.length ? [{ OR: sizes.map((s) => ({ options: { path: ["size"], equals: s } })) }] : []),
                    ...(colors.length ? [{ OR: colors.flatMap(colorMatch) }] : []),
                  ],
                },
              },
            },
          ]
        : []),
      ...attrFilters.map((a) => ({
        OR: a.values.map((v) => ({ metadata: { path: [a.def.key], equals: v } })),
      })),
    ],
  };

  const [products, total, counts, variantOptions, priceRange] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 1 },
        variants: { select: { price: true } },
      },
      orderBy: SORTS[sort].orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.product.count({ where }),
    prisma.product.groupBy({ by: ["categoryId"], where: scope, _count: { _all: true } }),
    prisma.productVariant.findMany({ where: { product: inCategory, stock: { gt: 0 } }, select: { options: true } }),
    prisma.product.aggregate({ where: inCategory, _min: { basePrice: true }, _max: { basePrice: true } }),
  ]);

  // Product counts per category, including subcategories.
  const direct = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  const countFor = (id: string) =>
    categoryAndDescendantIds(id, categories).reduce((s, cid) => s + (direct.get(cid) ?? 0), 0);
  const openRootId = current ? (current.parentId ?? current.id) : undefined;
  // Empty categories stay out of the menu (the one being viewed, and its parent, always show).
  const shown = (id: string) => countFor(id) > 0 || id === current?.id || id === openRootId;
  const roots = categories.filter((c) => !c.parentId && shown(c.id));
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id && shown(c.id));

  const sizeValues = new Set<string>();
  const colorValues = new Set<string>();
  for (const v of variantOptions) {
    for (const [k, val] of Object.entries(v.options as Record<string, string>)) {
      if (k === "size") sizeValues.add(val);
      else if (isColorKey(k)) colorValues.add(val);
    }
  }
  const sizeList = sortSizes([...new Set([...sizeValues, ...sizes])]);
  const colorList = [...new Set([...colorValues, ...colors])].sort((a, b) => a.localeCompare(b));

  /** Current URL with some params replaced (undefined removes). Resets paging unless given. */
  const href = (changes: Record<string, string | string[] | undefined>) =>
    listingHref({ ...sp, page: undefined, ...changes });
  // Filter and sort forms submit to the listing they're on; the category is in the path.
  const formAction = current ? `/category/${encodeURIComponent(current.slug)}` : "/products";
  const parentCategory = current?.parentId ? categories.find((c) => c.id === current.parentId) : undefined;
  const crumbs: Crumb[] = [
    { name: "Home", path: "/" },
    { name: "All products", path: "/products" },
    ...(parentCategory ? [{ name: parentCategory.name, path: `/category/${parentCategory.slug}` }] : []),
    ...(current ? [{ name: current.name, path: `/category/${current.slug}` }] : []),
  ];

  const activeChips = [
    ...(seller ? [{ label: `Seller: ${seller.storeName}`, href: href({ seller: undefined }) }] : []),
    ...(current ? [{ label: current.name, href: href({ category: undefined }) }] : []),
    ...(q ? [{ label: `“${q}”`, href: href({ q: undefined }) }] : []),
    ...(min || max
      ? [{ label: `${min ? formatMoney(market, min) : "Any"} – ${max ? formatMoney(market, max) : "Any"}`, href: href({ min: undefined, max: undefined }) }]
      : []),
    ...sizes.map((s) => ({ label: `Size ${s}`, href: href({ size: sizes.filter((x) => x !== s) }) })),
    ...colors.map((c) => ({ label: c, href: href({ color: colors.filter((x) => x !== c) }) })),
    ...attrFilters.flatMap((a) =>
      a.values.map((v) => ({ label: v, href: href({ [`attr_${a.def.key}`]: a.values.filter((x) => x !== v) }) })),
    ),
    ...(inStock ? [{ label: "In stock", href: href({ stock: undefined }) }] : []),
  ];

  const chip = (on: boolean) =>
    `flex cursor-pointer items-center rounded-full border px-3 py-1 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600 ${
      on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white hover:border-zinc-900"
    }`;
  const heading = "text-xs font-semibold uppercase tracking-wide text-zinc-500";

  const filters = (
    <div className="space-y-6">
      <section>
        <h2 className={heading}>Category</h2>
        <ul className="mt-2 space-y-0.5 text-sm">
          <li>
            <Link
              href={href({ category: undefined, ...Object.fromEntries(attrDefs.map((d) => [`attr_${d.key}`, undefined])) })}
              className={`block rounded px-2 py-1 ${!current ? "bg-teal-50 font-semibold text-teal-900" : "hover:bg-zinc-100"}`}
            >
              All products
            </Link>
          </li>
          {roots.map((r) => (
            <li key={r.id}>
              <Link
                href={href({ category: r.slug })}
                className={`flex justify-between rounded px-2 py-1 ${current?.id === r.id ? "bg-teal-50 font-semibold text-teal-900" : "hover:bg-zinc-100"}`}
              >
                <span>{r.name}</span>
                <span className="text-xs text-zinc-400">{countFor(r.id)}</span>
              </Link>
              {openRootId === r.id && childrenOf(r.id).length ? (
                <ul className="ml-3 border-l border-zinc-200 pl-2">
                  {childrenOf(r.id).map((c) => (
                    <li key={c.id}>
                      <Link
                        href={href({ category: c.slug })}
                        className={`flex justify-between rounded px-2 py-1 ${current?.id === c.id ? "bg-teal-50 font-semibold text-teal-900" : "hover:bg-zinc-100"}`}
                      >
                        <span>{c.name}</span>
                        <span className="text-xs text-zinc-400">{countFor(c.id)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <AutoSubmitForm action={formAction} className="space-y-6">
        {sort !== "featured" ? <input type="hidden" name="sort" value={sort} /> : null}
        {zone ? <input type="hidden" name="zone" value={zone} /> : null}
        {sellerId ? <input type="hidden" name="seller" value={sellerId} /> : null}

        <section>
          <h2 className={heading}>Search</h2>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search products"
            className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </section>

        <section>
          <h2 className={heading}>Price ({m.currency})</h2>
          <div className="mt-2 flex items-center gap-2">
            <input
              name="min"
              inputMode="numeric"
              defaultValue={min}
              placeholder={priceRange._min.basePrice ? String(Math.floor(Number(priceRange._min.basePrice))) : "Min"}
              aria-label="Minimum price"
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            />
            <span className="text-zinc-400">–</span>
            <input
              name="max"
              inputMode="numeric"
              defaultValue={max}
              placeholder={priceRange._max.basePrice ? String(Math.ceil(Number(priceRange._max.basePrice))) : "Max"}
              aria-label="Maximum price"
              className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
            />
          </div>
        </section>

        {sizeList.length ? (
          <section>
            <h2 className={heading}>Size</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sizeList.map((s) => (
                <label key={s} className={chip(sizes.includes(s))}>
                  <input type="checkbox" name="size" value={s} defaultChecked={sizes.includes(s)} className="sr-only" />
                  {s}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {colorList.length ? (
          <section>
            <h2 className={heading}>Colour</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {colorList.map((c) => (
                <label key={c} className={chip(colors.includes(c))}>
                  <input type="checkbox" name="color" value={c} defaultChecked={colors.includes(c)} className="sr-only" />
                  {c}
                </label>
              ))}
            </div>
          </section>
        ) : null}

        {attrDefs.map((d) => {
          const chosen = list(sp[`attr_${d.key}`]);
          return (
            <section key={d.key}>
              <h2 className={heading}>{d.name}</h2>
              <div className="mt-2 space-y-1 text-sm">
                {d.options.map((o) => (
                  <label key={o} className="flex items-center gap-2">
                    <input type="checkbox" name={`attr_${d.key}`} value={o} defaultChecked={chosen.includes(o)} />
                    {o}
                  </label>
                ))}
              </div>
            </section>
          );
        })}

        <section>
          <h2 className={heading}>Availability</h2>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="stock" value="1" defaultChecked={inStock} />
            In stock only
          </label>
        </section>

        <button type="submit" className="w-full rounded-lg bg-teal-700 py-2 text-sm font-semibold text-white hover:bg-teal-800">
          Apply filters
        </button>
      </AutoSubmitForm>
    </div>
  );

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Past the last page there is nothing to show (or index).
  if (page > pages) notFound();

  return (
    <>
      <SiteHeader />
      <main className={PAGE_WIDE}>
        {current ? <JsonLd data={breadcrumbJsonLd(crumbs)} /> : null}
        <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
          {crumbs.slice(1).map((c, i, rest) =>
            i === rest.length - 1 && current ? (
              <span key={c.path}>{` › ${c.name}`}</span>
            ) : (
              <span key={c.path}>
                {i > 0 ? " › " : ""}
                <Link href={c.path} className="hover:text-teal-700">
                  {c.name}
                </Link>
              </span>
            ),
          )}
        </nav>

        <div className="mt-4 grid gap-8 lg:grid-cols-[15rem_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">{filters}</div>
          </aside>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-zinc-900">{current?.name ?? seller?.storeName ?? "All products"}</h1>
                <p className="text-sm text-zinc-500">
                  {total} product{total === 1 ? "" : "s"}
                </p>
                {current?.description && page === 1 ? (
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">{current.description}</p>
                ) : null}
              </div>
              <AutoSubmitForm action={formAction} className="flex items-center gap-2 text-sm">
                {Object.entries(sp)
                  .filter(([k]) => k !== "sort" && k !== "page" && k !== "category")
                  .flatMap(([k, v]) => list(v).map((x, i) => <input key={`${k}-${i}`} type="hidden" name={k} value={x} />))}
                <label htmlFor="sort" className="text-zinc-600">
                  Sort by
                </label>
                <select id="sort" name="sort" defaultValue={sort} className="rounded-lg border border-zinc-300 px-2 py-1.5">
                  {Object.entries(SORTS).map(([k, s]) => (
                    <option key={k} value={k}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </AutoSubmitForm>
            </div>

            <details className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 lg:hidden">
              <summary className="cursor-pointer text-sm font-semibold">
                Filters{activeChips.length ? ` (${activeChips.length})` : ""}
              </summary>
              <div className="mt-4">{filters}</div>
            </details>

            {activeChips.length ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {activeChips.map((c) => (
                  <Link
                    key={c.label + c.href}
                    href={c.href}
                    className="flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-200"
                  >
                    {c.label} <span aria-hidden>×</span>
                    <span className="sr-only">remove filter</span>
                  </Link>
                ))}
                <Link href="/products" className="text-xs text-teal-700 hover:underline">
                  Clear all
                </Link>
              </div>
            ) : null}

            {products.length === 0 ? (
              <div className="mt-10 rounded-xl border border-dashed border-zinc-300 p-10 text-center text-zinc-600">
                No products match these filters.{" "}
                <Link href="/products" className="text-teal-700 underline">
                  Clear filters
                </Link>
              </div>
            ) : (
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {products.map((p) => {
                  const prices = p.variants.map((v) => Number(v.price ?? p.basePrice));
                  const from = prices.length ? Math.min(...prices) : Number(p.basePrice);
                  const varies = prices.some((x) => x !== from);
                  return (
                    <li key={p.id} className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                      <Link href={`/products/${p.slug}`} className="block">
                        <div className="relative aspect-square bg-zinc-100">
                          {p.images[0] ? (
                            <Image
                              src={p.images[0].url}
                              alt={p.name}
                              fill
                              unoptimized={!canOptimizeImage(p.images[0].url)}
                              className="object-cover transition duration-300 group-hover:scale-105"
                              sizes="(max-width:768px) 50vw, (max-width:1280px) 33vw, 25vw"
                            />
                          ) : null}
                          {p.stock <= 0 ? (
                            <span className="absolute bottom-2 left-2 rounded bg-zinc-900/80 px-2 py-0.5 text-xs text-white">
                              Sold out
                            </span>
                          ) : null}
                        </div>
                        <div className="p-3">
                          <h2 className="line-clamp-2 text-sm font-medium">{p.name}</h2>
                          <p className="mt-1 text-sm font-semibold text-teal-800">
                            {varies ? "From " : ""}
                            {formatMoney(market, from)}
                          </p>
                        </div>
                      </Link>
                      <FavoriteButton
                        productId={p.id}
                        productName={p.name}
                        className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow"
                      />
                    </li>
                  );
                })}
              </ul>
            )}

            {pages > 1 ? (
              <nav className="mt-8 flex items-center justify-center gap-2 text-sm" aria-label="Pages">
                {page > 1 ? (
                  <Link href={href({ page: String(page - 1) })} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:border-zinc-900">
                    ← Previous
                  </Link>
                ) : null}
                <span className="text-zinc-500">
                  Page {page} of {pages}
                </span>
                {page < pages ? (
                  <Link href={href({ page: String(page + 1) })} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:border-zinc-900">
                    Next →
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
