"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  status: string;
  createdAt: string;
  product: { id: string; name: string; slug: string };
  orderItem: { order: { id: string; orderNumber: string; customerEmail: string } };
};

/** Verified-buyer reviews: hide anything abusive or off-topic, or delete it. */
export default function AdminReviewsPage() {
  const [filters, setFilters] = useState({ status: "", rating: "", page: 1 });
  const [data, setData] = useState<{ reviews: Review[]; total: number; pageSize: number }>({ reviews: [], total: 0, pageSize: 50 });
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== "").map(([k, v]) => [k, String(v)]));
    const res = await fetch(`/api/admin/reviews?${qs}`);
    return res.ok ? res.json() : { reviews: [], total: 0, pageSize: 50 };
  }, [filters]);

  useEffect(() => {
    let ignore = false;
    void load().then((j) => {
      if (!ignore) setData(j);
    });
    return () => {
      ignore = true;
    };
  }, [load]);

  async function act(r: Review, action: "hide" | "show" | "delete") {
    if (action === "delete" && !confirm("Delete this review for good? The buyer will be able to write a new one.")) return;
    const res =
      action === "delete"
        ? await fetch(`/api/admin/reviews?id=${r.id}`, { method: "DELETE" })
        : await fetch("/api/admin/reviews", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: r.id, status: action === "hide" ? "hidden" : "published" }),
          });
    const j = await res.json().catch(() => ({}));
    setNote(res.ok ? (action === "delete" ? "Deleted" : action === "hide" ? "Hidden from the product page" : "Published") : (j.error ?? "Failed"));
    setData(await load());
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reviews</h1>
        <p className="text-sm text-zinc-600">
          Only buyers with a delivered order can review a product. Reviews appear straight away; hide anything abusive, off-topic or
          containing personal details.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))} className="rounded border px-2 py-1.5 text-sm">
          <option value="">All reviews</option>
          <option value="published">Published</option>
          <option value="hidden">Hidden</option>
        </select>
        <select value={filters.rating} onChange={(e) => setFilters((f) => ({ ...f, rating: e.target.value, page: 1 }))} className="rounded border px-2 py-1.5 text-sm">
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n > 1 ? "s" : ""}
            </option>
          ))}
        </select>
        <span className="self-center text-sm text-zinc-600">{data.total} reviews</span>
      </div>
      {note ? <p className="text-sm text-zinc-600">{note}</p> : null}

      <ul className="space-y-3">
        {data.reviews.map((r) => (
          <li key={r.id} className={`rounded-xl border bg-white p-4 text-sm ${r.status === "hidden" ? "border-zinc-300 opacity-70" : "border-zinc-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p>
                  <span className="text-amber-500">{"★".repeat(r.rating)}</span>
                  <span className="text-zinc-300">{"★".repeat(5 - r.rating)}</span>
                  {r.title ? <span className="ml-2 font-semibold">{r.title}</span> : null}
                  {r.status === "hidden" ? <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-xs">Hidden</span> : null}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {r.authorName} ({r.orderItem.order.customerEmail}) ·{" "}
                  <Link href={`/admin/orders/${r.orderItem.order.id}`} className="text-teal-700 hover:underline">
                    {r.orderItem.order.orderNumber}
                  </Link>{" "}
                  · {r.createdAt.slice(0, 10)} ·{" "}
                  <Link href={`/products/${r.product.slug}#reviews`} target="_blank" className="text-teal-700 hover:underline">
                    {r.product.name}
                  </Link>
                </p>
              </div>
              <div className="flex gap-2">
                {r.status === "hidden" ? (
                  <button type="button" onClick={() => act(r, "show")} className="rounded border border-teal-700 px-2 py-1 text-xs text-teal-800">
                    Publish
                  </button>
                ) : (
                  <button type="button" onClick={() => act(r, "hide")} className="rounded border border-zinc-400 px-2 py-1 text-xs">
                    Hide
                  </button>
                )}
                <button type="button" onClick={() => act(r, "delete")} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-zinc-700">{r.body}</p>
          </li>
        ))}
      </ul>
      {data.reviews.length === 0 ? <p className="text-sm text-zinc-500">No reviews yet.</p> : null}
      {pages > 1 ? (
        <div className="flex items-center gap-2 text-sm">
          <button type="button" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))} className="rounded border px-2 py-1 disabled:opacity-40">
            ← Previous
          </button>
          <span>
            Page {filters.page} of {pages}
          </span>
          <button type="button" disabled={filters.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))} className="rounded border px-2 py-1 disabled:opacity-40">
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}
