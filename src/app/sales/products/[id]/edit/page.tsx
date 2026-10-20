"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { describeError, ProductForm, type FormVendor, type ProductFormInitial } from "@/components/product-form";
import type { MarketCode } from "@/lib/markets";

type Product = ProductFormInitial & {
  id: string;
  approvalStatus: string;
  rejectionReason: string | null;
  images: { url: string; color: string | null }[];
  videos: { url: string }[];
  vendor: { id: string; storeName: string; market: MarketCode };
};

/** Fix a pending or rejected listing (e.g. replace images/videos after a rejection). */
export default function EditSalesProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [vendor, setVendor] = useState<FormVendor | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    void Promise.all([
      fetch(`/api/sales/products?id=${encodeURIComponent(id)}`).then((r) => r.json()),
      fetch("/api/vendors/public").then((r) => r.json()),
    ]).then(([p, v]) => {
      if (ignore) return;
      if (!p.product) {
        setError(p.error ?? "Not found");
        return;
      }
      const listed = (v.vendors as FormVendor[] | undefined)?.find((x) => x.id === p.product.vendor.id);
      setVendor(listed ?? { ...p.product.vendor, taxRegistered: p.product.salesTaxBps > 0 });
      setProduct(p.product);
    });
    return () => {
      ignore = true;
    };
  }, [id]);

  async function save(payload: Record<string, unknown>) {
    const res = await fetch("/api/sales/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, id }),
    });
    if (res.ok) {
      router.push("/sales/products");
      return null;
    }
    const j = await res.json().catch(() => ({}));
    return describeError(j.error);
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!product || !vendor) return <p className="text-sm text-zinc-500">Loading…</p>;
  if (product.approvalStatus === "APPROVED") {
    return (
      <p className="text-sm text-zinc-700">
        This product is approved and locked. Ask an admin to unpublish it before editing.{" "}
        <Link href="/sales/products" className="text-teal-700 underline">Back</Link>
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Edit product</h1>
      {product.rejectionReason ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Rejected:</strong> {product.rejectionReason}
        </p>
      ) : null}
      <p className="text-sm text-zinc-600">Saving sends the product back for review.</p>
      <ProductForm
        variant="sales"
        vendorEditable={false}
        currentVendor={vendor}
        initial={{
          ...product,
          imageUrls: product.images.map((i) => i.url),
          videoUrls: product.videos.map((v) => v.url),
          imageColors: Object.fromEntries(product.images.filter((i) => i.color).map((i) => [i.url, i.color!])),
        }}
        submitLabel="Save and resubmit"
        onSubmit={save}
      />
    </div>
  );
}
