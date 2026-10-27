import { cache } from "react";
import { prisma } from "@/lib/db";

// Info pages (/about, /return-policy…) and blog posts (/blog/<slug>) written in Admin › Content.

export type ContentKind = "page" | "post";

/** First path segments the app already uses; an info page can't take one of these. */
const RESERVED = new Set([
  "account", "admin", "api", "auth", "blog", "cart", "category", "checkout", "favorites", "orders",
  "products", "sales", "sellers", "store", "vendor", "robots.txt", "sitemap.xml", "icon.png",
  "apple-icon.png", "favicon.ico", "_next", "uploads",
]);

/** Lower-case words joined by hyphens: "return-policy". */
export function validSlug(slug: string, kind: ContentKind): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    return "Use lower-case letters, numbers and hyphens, e.g. return-policy";
  }
  if (kind === "page" && RESERVED.has(slug)) return `"${slug}" is already used by the site; choose another address`;
  return null;
}

export const getPublishedPage = cache((slug: string) =>
  prisma.contentPage.findFirst({ where: { kind: "page", slug, status: "published" } }),
);

export const getPublishedPost = cache((slug: string) =>
  prisma.contentPage.findFirst({ where: { kind: "post", slug, status: "published" } }),
);

/** Published info pages shown in the footer, in the owner's order. */
export function footerPages() {
  return prisma.contentPage.findMany({
    where: { kind: "page", status: "published", showInFooter: true },
    select: { slug: true, title: true },
    orderBy: [{ footerOrder: "asc" }, { title: "asc" }],
  });
}

export function contentPath(kind: ContentKind, slug: string) {
  return kind === "page" ? `/${slug}` : `/blog/${slug}`;
}
