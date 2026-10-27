import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { canOptimizeImage } from "@/lib/media-url";
import { PAGE_WIDE } from "@/lib/page-layout";
import { SITE_NAME } from "@/lib/seo";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 12;
type Props = { searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  return {
    title: `Shopping Guides & Tips${page > 1 ? ` – Page ${page}` : ""}`,
    description: `Buying guides, style tips and how-tos from ${SITE_NAME} to help you shop online in Pakistan with confidence.`,
    alternates: { canonical: page > 1 ? `/blog?page=${page}` : "/blog" },
  };
}

export default async function BlogIndex({ searchParams }: Props) {
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const where = { kind: "post", status: "published" };
  const [posts, total] = await Promise.all([
    prisma.contentPage.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { slug: true, title: true, excerpt: true, coverImageUrl: true, publishedAt: true },
    }),
    prisma.contentPage.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pages) notFound();

  return (
    <>
      <SiteHeader />
      <main className={PAGE_WIDE}>
        <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Shopping guides &amp; tips</h1>
        <p className="mt-1 text-sm text-zinc-600">Buying guides and how-tos to help you choose well.</p>
        {posts.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-600">
            Our first guides are coming soon.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <li key={p.slug} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <Link href={`/blog/${p.slug}`} className="group block">
                  <div className="relative aspect-[1200/630] bg-zinc-100">
                    {p.coverImageUrl ? (
                      <Image
                        src={p.coverImageUrl}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        unoptimized={!canOptimizeImage(p.coverImageUrl)}
                        className="object-cover transition group-hover:scale-[1.02]"
                      />
                    ) : null}
                  </div>
                  <div className="p-4">
                    <h2 className="font-semibold text-zinc-900 group-hover:text-teal-800">{p.title}</h2>
                    {p.excerpt ? <p className="mt-1 line-clamp-3 text-sm text-zinc-600">{p.excerpt}</p> : null}
                    {p.publishedAt ? (
                      <p className="mt-2 text-xs text-zinc-500">{p.publishedAt.toLocaleDateString("en-PK", { dateStyle: "medium" })}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 ? (
          <nav className="mt-8 flex items-center justify-center gap-2 text-sm" aria-label="Pages">
            {page > 1 ? (
              <Link href={`/blog?page=${page - 1}`} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:border-zinc-900">
                ← Newer
              </Link>
            ) : null}
            <span className="text-zinc-500">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={`/blog?page=${page + 1}`} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:border-zinc-900">
                Older →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
