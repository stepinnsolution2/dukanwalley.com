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

/** The store name shoppers see: the admin-set display name when there is one. */
export function publicStoreName(vendor: { storeName: string; displayName?: string | null }) {
  return vendor.displayName?.trim() || vendor.storeName;
}

/** A vendor object safe to send to shoppers: storeName replaced by the public name. */
export function publicVendor<T extends { storeName: string; displayName?: string | null }>(vendor: T) {
  const safe: Partial<T> = { ...vendor, storeName: publicStoreName(vendor) };
  delete safe.displayName;
  return safe as Omit<T, "displayName">;
}
