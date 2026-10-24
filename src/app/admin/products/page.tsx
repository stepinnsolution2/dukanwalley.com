"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { MARKET_CODES, MARKETS, type MarketCode } from "@/lib/markets";
import { can } from "@/lib/permissions";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  approvalStatus: string;
  displayOnStorefront: boolean;
  availableForSale: boolean;
  isHot: boolean;
  stock: number;
  images: { url: string }[];
  category: { name: string };
  salesPerson: { user: { name: string | null; email: string } } | null;
  vendor: { storeName: string; market: MarketCode };
};

const tabs = [
  { status: "PENDING_REVIEW", label: "Pending review" },
  { status: "APPROVED", label: "Approved" },
  { status: "REJECTED", label: "Rejected" },
  { status: "", label: "All" },
];

const bulkActions = [
  { action: "hide", label: "Hide" },
  { action: "show", label: "Show" },
  { action: "stop-selling", label: "Stop selling" },
  { action: "start-selling", label: "Start selling" },
  { action: "mark-hot", label: "Mark hot" },
  { action: "unmark-hot", label: "Unmark hot" },
] as const;

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <ProductsList />
    </Suspense>
  );
}

function ProductsList() {
  const { data: session } = useSession();
  const canEdit = can(session?.user?.role, "products:edit");
  // ?vendorId= comes from the vendor page; show all statuses for that vendor.
  const vendorId = useSearchParams().get("vendorId") ?? "";
  const [filters, setFilters] = useState({
    status: vendorId ? "" : "PENDING_REVIEW",
    market: "",
    visibility: "",
    q: "",
    vendorId,
    page: 1,
  });
  const [data, setData] = useState<{ products: Product[]; total: number; pageSize: number }>({ products: [], total: 0, pageSize: 50 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined).map(([k, v]) => [k, String(v)]),
    );
    const res = await fetch(`/api/admin/products?${qs}`);
    return res.json();
  }, [filters]);

  useEffect(() => {
    let ignore = false;
    void load().then((j) => {
      if (ignore) return;
      setData({ products: j.products ?? [], total: j.total ?? 0, pageSize: j.pageSize ?? 50 });
      setSelected(new Set());
    });
    return () => {
      ignore = true;
    };
  }, [load]);

  async function bulk(action: (typeof bulkActions)[number]["action"]) {
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action }),
    });
    const j = await res.json().catch(() => ({}));
    setNote(res.ok ? `${j.updated} updated${j.skipped ? `, ${j.skipped} skipped (not approved / not displayed)` : ""}` : j.error ?? "Failed");
    const fresh = await load();
    setData({ products: fresh.products ?? [], total: fresh.total ?? 0, pageSize: fresh.pageSize ?? 50 });
    setSelected(new Set());
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Products</h1>
        {can(session?.user?.role, "products:import") ? (
          <Link href="/admin/products/import" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-zinc-900">
            Import from Markaz
          </Link>
        ) : null}
      </div>
      {filters.vendorId ? (
        <p className="mt-1 text-sm text-zinc-600">
          Filtered to one vendor ·{" "}
          <button type="button" className="underline" onClick={() => setFilters((f) => ({ ...f, vendorId: "", page: 1 }))}>
            show all vendors
          </button>
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-1">
        {tabs.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, status: t.status, page: 1 }))}
            className={`rounded-full px-3 py-1 text-sm ${filters.status === t.status ? "bg-teal-700 text-white" : "bg-white text-zinc-700 hover:bg-zinc-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          placeholder="Search name or SKU"
          defaultValue={filters.q}
          onKeyDown={(e) => {
            if (e.key === "Enter") setFilters((f) => ({ ...f, q: (e.target as HTMLInputElement).value, page: 1 }));
          }}
          className="rounded border px-3 py-1.5 text-sm"
        />
        <select value={filters.market} onChange={(e) => setFilters((f) => ({ ...f, market: e.target.value, page: 1 }))} className="rounded border px-2 py-1.5 text-sm">
          <option value="">All countries</option>
          {MARKET_CODES.map((c) => (
            <option key={c} value={c}>
              {MARKETS[c].name}
            </option>
          ))}
        </select>
        <select value={filters.visibility} onChange={(e) => setFilters((f) => ({ ...f, visibility: e.target.value, page: 1 }))} className="rounded border px-2 py-1.5 text-sm">
          <option value="">Any visibility</option>
          <option value="live">Live and for sale</option>
          <option value="hidden">Hidden</option>
        </select>
      </div>

      {canEdit && selected.size > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm">
          <span>{selected.size} selected:</span>
          {bulkActions.map((b) => (
            <button key={b.action} type="button" onClick={() => bulk(b.action)} className="rounded border border-teal-700 bg-white px-2 py-1 text-xs text-teal-800">
              {b.label}
            </button>
          ))}
        </div>
      ) : null}
      {note ? <p className="mt-2 text-sm text-zinc-600">{note}</p> : null}

      <ul className="mt-4 space-y-2">
        {data.products.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2">
            {canEdit ? <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} /> : null}
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-100">
              {p.images[0] ? <Image src={p.images[0].url} alt="" fill unoptimized className="object-cover" sizes="48px" /> : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name}</p>
              <p className="text-xs text-zinc-500">
                {p.vendor.storeName} ({p.vendor.market}) · {p.category.name} · stock {p.stock} · Sales:{" "}
                {p.salesPerson?.user.name ?? p.salesPerson?.user.email ?? "—"}
              </p>
              <p className="text-xs">
                <span className="font-medium">{p.approvalStatus.replace("_", " ").toLowerCase()}</span>
                {p.approvalStatus === "APPROVED"
                  ? p.availableForSale
                    ? " · live"
                    : p.displayOnStorefront
                      ? " · visible, not for sale"
                      : " · hidden"
                  : ""}
                {p.isHot ? <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 font-medium text-orange-700">Hot</span> : null}
              </p>
            </div>
            <Link href={`/admin/products/${p.id}`} className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800">
              {p.approvalStatus === "PENDING_REVIEW" ? "Review" : "Open"}
            </Link>
          </li>
        ))}
      </ul>
      {data.products.length === 0 ? <p className="mt-6 text-zinc-500">No products match.</p> : null}
      {pages > 1 ? (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <button type="button" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))} className="rounded border px-2 py-1 disabled:opacity-40">
            Previous
          </button>
          <span>
            Page {filters.page} of {pages} ({data.total} products)
          </span>
          <button type="button" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))} className="rounded border px-2 py-1 disabled:opacity-40">
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
