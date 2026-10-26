"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { describeError, ProductForm, type AttributeDef } from "@/components/product-form";
import { formatMoney, MARKETS, type MarketCode } from "@/lib/markets";
import { variantLabel } from "@/lib/variants";
import { can } from "@/lib/permissions";

type Product = {
  id: string;
  name: string;
  description: string | null;
  basePrice: string;
  salesTaxBps: number;
  stock: number;
  sku: string | null;
  featuredPriority: number;
  zoneTags: string[];
  categoryId: string;
  vendorId: string;
  metadata: Record<string, unknown> | null;
  approvalStatus: string;
  rejectionReason: string | null;
  displayOnStorefront: boolean;
  availableForSale: boolean;
  isHot: boolean;
  isPopular: boolean;
  approvedAt: string | null;
  images: { url: string; color: string | null }[];
  videos: { url: string }[];
  variants: { options: Record<string, string>; stock: number; price: string | null; sku: string | null }[];
  category: { name: string; attributeDefs: AttributeDef[] };
  vendor: { id: string; storeName: string; market: MarketCode; taxRegNo: string | null; kycStatus: string; restriction: string };
  salesPerson: { user: { name: string | null; email: string } } | null;
  approvedBy: { name: string | null; email: string } | null;
};

export default function AdminProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const canReview = can(session?.user?.role, "products:review");
  const canEdit = can(session?.user?.role, "products:edit");
  const [product, setProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [display, setDisplay] = useState(true);
  const [forSale, setForSale] = useState(true);
  const [hotError, setHotError] = useState<string | null>(null);

  const fetchProduct = useCallback(
    () => fetch(`/api/admin/products/${id}`).then((r) => r.json()).then((j) => j.product as Product),
    [id],
  );

  useEffect(() => {
    let ignore = false;
    void fetchProduct().then((p) => {
      if (!ignore) setProduct(p);
    });
    return () => {
      ignore = true;
    };
  }, [fetchProduct]);

  async function review(action: "approve" | "reject") {
    setError(null);
    const body = action === "reject" ? { action, reason } : { action, displayOnStorefront: display, availableForSale: forSale };
    const res = await fetch(`/api/admin/products/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push("/admin/products");
      return;
    }
    const j = await res.json().catch(() => ({}));
    setError(action === "reject" && reason.trim().length < 3 ? "Enter a rejection reason (at least 3 characters)" : describeError(j.error));
  }

  async function save(payload: Record<string, unknown>) {
    const res = await fetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return describeError(j.error);
    setProduct(j.product);
    setEditing(false);
    return null;
  }

  /** Home page rows: Trending (isHot) and Most Popular. */
  async function toggleHome(flags: { isHot?: boolean; isPopular?: boolean; featuredPriority?: number }) {
    setHotError(await save(flags));
  }

  if (!product) return <div className="p-6">Loading…</div>;
  const m = MARKETS[product.vendor.market];
  const attrs = product.category.attributeDefs;
  const meta = product.metadata ?? {};

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{product.name}</h1>
          <p className="text-sm text-zinc-600">
            {product.vendor.storeName} · {m.name} · {product.category.name} · uploaded by{" "}
            <strong>{product.salesPerson?.user.name ?? product.salesPerson?.user.email ?? "—"}</strong>
          </p>
        </div>
        {canEdit ? (
          <button type="button" onClick={() => setEditing((e) => !e)} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm">
            {editing ? "Close editor" : "Edit details"}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <ProductForm
            variant="admin"
            vendorEditable
            currentVendor={{
              id: product.vendor.id,
              storeName: product.vendor.storeName,
              market: product.vendor.market,
              taxRegistered: !!product.vendor.taxRegNo,
            }}
            initial={{
              ...product,
              imageUrls: product.images.map((i) => i.url),
              videoUrls: product.videos.map((v) => v.url),
              imageColors: Object.fromEntries(product.images.filter((i) => i.color).map((i) => [i.url, i.color!])),
            }}
            submitLabel="Save changes"
            onSubmit={save}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {product.images.map((img, i) => (
                  <a key={img.url} href={img.url} target="_blank" rel="noreferrer" className={`relative aspect-square overflow-hidden rounded bg-zinc-100 ${i === 0 ? "col-span-3" : ""}`}>
                    <Image src={img.url} alt="" fill unoptimized className="object-cover" sizes="400px" />
                  </a>
                ))}
              </div>
              {product.videos.map((v) => (
                <video key={v.url} src={v.url} controls preload="metadata" className="w-full rounded bg-black" />
              ))}
            </div>
            <div className="space-y-3 text-sm">
              <p className="text-2xl font-semibold text-teal-800">{formatMoney(product.vendor.market, product.basePrice)}</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                <dt className="text-zinc-500">{m.taxName} included</dt>
                <dd>{product.vendor.taxRegNo ? `${product.salesTaxBps / 100}%` : "none (vendor not registered)"}</dd>
                <dt className="text-zinc-500">Stock</dt>
                <dd>{product.stock}</dd>
                <dt className="text-zinc-500">SKU</dt>
                <dd>{product.sku ?? "—"}</dd>
                <dt className="text-zinc-500">Status</dt>
                <dd>
                  {product.approvalStatus}
                  {product.approvalStatus === "APPROVED"
                    ? product.availableForSale
                      ? " · live"
                      : product.displayOnStorefront
                        ? " · visible, not for sale"
                        : " · hidden"
                    : ""}
                </dd>
                {product.approvedBy ? (
                  <>
                    <dt className="text-zinc-500">Reviewed by</dt>
                    <dd>{product.approvedBy.name ?? product.approvedBy.email}</dd>
                  </>
                ) : null}
                <dt className="text-zinc-500">Vendor</dt>
                <dd>
                  KYC {product.vendor.kycStatus.toLowerCase()}
                  {product.vendor.restriction !== "NONE" ? ` · ${product.vendor.restriction.toLowerCase().replace("_", " ")}` : ""}
                </dd>
                {attrs.filter((a) => !a.isVariant).map((a) => (
                  <div key={a.key} className="contents">
                    <dt className="text-zinc-500">{a.name}</dt>
                    <dd>{meta[a.key] === undefined ? <span className="text-red-600">{a.required ? "missing" : "—"}</span> : String(meta[a.key] === true ? "Yes" : meta[a.key] === false ? "No" : meta[a.key])}</dd>
                  </div>
                ))}
              </dl>
              {product.variants.length ? (
                <div>
                  <p className="font-medium text-zinc-700">Options ({product.variants.length})</p>
                  <ul className="mt-1 max-h-48 divide-y divide-zinc-100 overflow-auto rounded border border-zinc-200">
                    {product.variants.map((v) => (
                      <li key={JSON.stringify(v.options)} className="flex justify-between gap-2 px-2 py-1">
                        <span>{variantLabel(v.options, Object.fromEntries(attrs.map((a) => [a.key, a.name])))}</span>
                        <span className={v.stock > 0 ? "text-zinc-600" : "text-red-600"}>
                          {v.stock} in stock
                          {v.price != null ? ` · ${formatMoney(product.vendor.market, v.price)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : attrs.some((a) => a.isVariant && a.required) ? (
                <p className="text-red-600">No options (e.g. sizes) set — edit the product to add them.</p>
              ) : null}
              {product.description ? <p className="whitespace-pre-line text-zinc-700">{product.description}</p> : null}
              {product.rejectionReason ? <p className="text-red-700">Last rejection: {product.rejectionReason}</p> : null}
            </div>
          </div>

          {product.approvalStatus === "APPROVED" && canEdit ? (
            <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm">
              <p className="font-semibold text-zinc-900">Home page</p>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={product.isHot} onChange={(e) => toggleHome({ isHot: e.target.checked })} />
                  Trending
                </label>
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={product.featuredPriority > 0}
                    // Featured = priority above 0; a higher priority set in the edit form is kept.
                    onChange={(e) => toggleHome({ featuredPriority: e.target.checked ? Math.max(1, product.featuredPriority) : 0 })}
                  />
                  Featured
                </label>
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={product.isPopular} onChange={(e) => toggleHome({ isPopular: e.target.checked })} />
                  Most popular
                </label>
              </div>
              <p className="text-zinc-600">
                Ticked products appear in the “Trending”, “Featured” and “Most Popular” rows on the home page. Higher featured
                priority (edit form) shows first.
              </p>
              {hotError ? <p className="text-red-600">{hotError}</p> : null}
            </div>
          ) : null}

          {!canReview ? (
            <p className="text-sm text-zinc-500">Your role can view listings but not approve them.</p>
          ) : (
            <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="font-semibold">Review</h2>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} />
                Display on storefront
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={display && forSale} disabled={!display} onChange={(e) => setForSale(e.target.checked)} />
                Available for sale
              </label>
              <textarea
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Rejection reason (shown to the salesperson; required to reject)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => review("approve")} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white">
                  Approve
                </button>
                <button type="button" onClick={() => review("reject")} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white">
                  Reject
                </button>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
