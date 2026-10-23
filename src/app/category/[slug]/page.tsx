import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { listingMetadata, ProductListing, type SP } from "../../products/product-listing";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

function findCategory(slug: string) {
  return prisma.category.findUnique({
    where: { slug },
    select: { name: true, slug: true, parent: { select: { name: true } } },
  });
}

export async function generateMetadata({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await findCategory(decodeURIComponent(slug));
  if (!category) return {};
  return listingMetadata(await searchParams, { ...category, parentName: category.parent?.name });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const slug = decodeURIComponent((await params).slug);
  if (!(await findCategory(slug))) notFound();
  // The path decides the category, even if a stray ?category= is also present.
  return <ProductListing sp={{ ...(await searchParams), category: slug }} />;
}
