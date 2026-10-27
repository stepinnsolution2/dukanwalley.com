import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { Markdown } from "@/components/markdown";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPublishedPost } from "@/lib/content";
import { canOptimizeImage } from "@/lib/media-url";
import { PAGE_NARROW } from "@/lib/page-layout";
import { absoluteUrl, breadcrumbJsonLd, metaDescription, SITE_NAME, SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublishedPost((await params).slug);
  if (!post) return {};
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || metaDescription(post.excerpt || post.body.replace(/[#*_>`[\]()-]/g, " "));
  const path = `/blog/${post.slug}`;
  return {
    title: title.includes(SITE_NAME) ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title,
      description,
      url: path,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      images: post.coverImageUrl ? [{ url: post.coverImageUrl, width: 1200, height: 630, alt: post.title }] : undefined,
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const post = await getPublishedPost((await params).slug);
  if (!post) notFound();
  const path = `/blog/${post.slug}`;
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    ...(post.excerpt ? { description: post.excerpt } : {}),
    ...(post.coverImageUrl ? { image: [absoluteUrl(post.coverImageUrl)] } : {}),
    datePublished: (post.publishedAt ?? post.createdAt).toISOString(),
    dateModified: post.updatedAt.toISOString(),
    mainEntityOfPage: absoluteUrl(path),
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, logo: { "@type": "ImageObject", url: absoluteUrl("/logo.png") } },
  };

  return (
    <>
      <JsonLd data={article} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Guides", path: "/blog" },
          { name: post.title, path },
        ])}
      />
      <SiteHeader />
      <main className={PAGE_NARROW}>
        <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-teal-700">
            Home
          </Link>
          {" › "}
          <Link href="/blog" className="hover:text-teal-700">
            Guides
          </Link>
        </nav>
        <article className="mt-3">
          <h1 className="text-3xl font-semibold leading-tight text-zinc-900">{post.title}</h1>
          {post.publishedAt ? (
            <p className="mt-1 text-xs text-zinc-500">{post.publishedAt.toLocaleDateString("en-PK", { dateStyle: "long" })}</p>
          ) : null}
          {post.coverImageUrl ? (
            <div className="relative mt-5 aspect-[1200/630] overflow-hidden bg-zinc-100">
              <Image
                src={post.coverImageUrl}
                alt={post.title}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 768px"
                unoptimized={!canOptimizeImage(post.coverImageUrl)}
                className="object-cover"
              />
            </div>
          ) : null}
          <Markdown>{post.body}</Markdown>
        </article>
        <p className="mt-10 border-t border-zinc-200 pt-4 text-sm">
          <Link href="/blog" className="font-medium text-teal-700 hover:underline">
            ← More guides
          </Link>
          {" · "}
          <Link href="/products" className="font-medium text-teal-700 hover:underline">
            Shop all products
          </Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
