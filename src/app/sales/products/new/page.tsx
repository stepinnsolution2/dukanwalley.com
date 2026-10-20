"use client";

import { useRouter } from "next/navigation";
import { describeError, ProductForm } from "@/components/product-form";

export default function NewProductPage() {
  const router = useRouter();

  async function create(payload: Record<string, unknown>) {
    const res = await fetch("/api/sales/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      router.push("/sales/products");
      return null;
    }
    const j = await res.json().catch(() => ({}));
    return describeError(j.error);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Upload product</h1>
      <p className="text-sm text-zinc-600">Submitted products wait for review by the company before going live.</p>
      <ProductForm variant="sales" vendorEditable submitLabel="Submit for review" onSubmit={create} />
    </div>
  );
}
