import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { Markdown } from "@/components/markdown";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublishedPage } from "@/lib/content";
import { PAGE_NARROW } from "@/lib/page-layout";
import { breadcrumbJsonLd, metaDescription, SITE_NAME } from "@/lib/seo";

// Info pages written in Admin › Content (About, Contact, Shipping, Return policy…). Static routes
// (/products, /cart…) take precedence, and those addresses can't be chosen for a page.

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ page: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPublishedPage((await params).page);
  if (!page) return {};
  const description = page.seoDescription || metaDescription(page.excerpt || page.body.replace(/[#*_>`[\]()-]/g, " "));
  const title = page.seoTitle || page.title;
  return {
    // "About DukanWalley" already names the site: don't append " | DukanWalley" again.
    title: title.includes(SITE_NAME) ? { absolute: title } : title,
    description,
    alternates: { canonical: `/${page.slug}` },
    openGraph: { title, description, url: `/${page.slug}`, type: "website", siteName: SITE_NAME },
  };
}

export default async function InfoPage({ params }: Props) {
  const page = await getPublishedPage((await params).page);
  if (!page) notFound();
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: page.title, path: `/${page.slug}` },
        ])}
      />
      <SiteHeader />
      <main className={PAGE_NARROW}>
        <article>
          <h1 className="text-3xl font-semibold text-zinc-900">{page.title}</h1>
          <p className="mt-1 text-xs text-zinc-500">Last updated {page.updatedAt.toLocaleDateString("en-PK", { dateStyle: "long" })}</p>
          <Markdown>{page.body}</Markdown>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
