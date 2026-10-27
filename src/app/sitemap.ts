import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { categoryAndDescendantIds, sellableVendorWhere, storefrontProductWhere } from "@/lib/catalog";
import { DEFAULT_MARKET } from "@/lib/markets";
import { absoluteUrl } from "@/lib/seo";
import { contentPath } from "@/lib/content";

// Built per request so new and removed products show up without a redeploy.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, listedInDefaultMarket, stores, content] = await Promise.all([
    // Same visibility rule as the product page itself.
    prisma.product.findMany({
      where: { approvalStatus: "APPROVED", displayOnStorefront: true, vendor: sellableVendorWhere },
      select: { slug: true, updatedAt: true, images: { orderBy: { sortOrder: "asc" }, select: { url: true }, take: 5 } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.category.findMany({ select: { id: true, slug: true, parentId: true } }),
    // Category pages list the default market to crawlers, so only include categories with products there.
    prisma.product.groupBy({ by: ["categoryId"], where: storefrontProductWhere(DEFAULT_MARKET), _max: { updatedAt: true } }),
    // Store pages, for stores with something listed in the default market.
    prisma.vendorProfile.findMany({
      where: { ...sellableVendorWhere, slug: { not: null }, products: { some: storefrontProductWhere(DEFAULT_MARKET) } },
      select: { slug: true, updatedAt: true },
    }),
    // Published info pages and blog posts.
    prisma.contentPage.findMany({ where: { status: "published" }, select: { kind: true, slug: true, updatedAt: true } }),
  ]);

  const latestByCategory = new Map(listedInDefaultMarket.map((g) => [g.categoryId, g._max.updatedAt]));
  const categoryEntries = categories.flatMap((c) => {
    const dates = categoryAndDescendantIds(c.id, categories)
      .map((id) => latestByCategory.get(id))
      .filter((d): d is Date => !!d);
    if (!dates.length) return [];
    return [{
      url: absoluteUrl(`/category/${c.slug}`),
      lastModified: new Date(Math.max(...dates.map((d) => d.getTime()))),
      changeFrequency: "daily" as const,
      priority: c.parentId ? 0.7 : 0.8,
    }];
  });

  const newest = products[0]?.updatedAt ?? new Date();
  return [
    { url: absoluteUrl("/"), lastModified: newest, changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/products"), lastModified: newest, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/sellers"), changeFrequency: "weekly", priority: 0.5 },
    { url: absoluteUrl("/vendor/register"), changeFrequency: "monthly", priority: 0.3 },
    ...(content.some((c) => c.kind === "post") ? [{ url: absoluteUrl("/blog"), changeFrequency: "weekly" as const, priority: 0.5 }] : []),
    ...content.map((c) => ({
      url: absoluteUrl(contentPath(c.kind as "page" | "post", c.slug)),
      lastModified: c.updatedAt,
      changeFrequency: "monthly" as const,
      priority: c.kind === "post" ? 0.5 : 0.4,
    })),
    ...categoryEntries,
    ...stores.map((s) => ({
      url: absoluteUrl(`/store/${s.slug}`),
      lastModified: s.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    ...products.map((p) => ({
      url: absoluteUrl(`/products/${p.slug}`),
      lastModified: p.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
      images: p.images.map((i) => absoluteUrl(i.url)),
    })),
  ];
}
