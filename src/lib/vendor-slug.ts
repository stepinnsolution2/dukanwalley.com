import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";

/** URL slug for a new store: its name when free, otherwise the name plus a short suffix. */
export async function uniqueVendorSlug(storeName: string) {
  const base = slugify(storeName) || "store";
  const taken = await prisma.vendorProfile.findUnique({ where: { slug: base }, select: { id: true } });
  return taken ? `${base}-${randomBytes(2).toString("hex")}` : base;
}

/** Public store page, falling back to the filtered listing for stores created before slugs. */
export function storeHref(vendor: { id: string; slug: string | null }) {
  return vendor.slug ? `/store/${vendor.slug}` : `/products?seller=${vendor.id}`;
}
