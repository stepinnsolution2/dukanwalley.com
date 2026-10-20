"use client";

import { useEffect, useState } from "react";

export default function AdminReportsPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/reports");
      setData(await res.json());
    })();
  }, []);

  if (!data) return <div className="p-6">Loading…</div>;

  const mostSold = data.mostSold as { units: number; product?: { name: string } }[];
  const mostVisited = data.mostVisited as { views: number; product?: { name: string } }[];
  const suggestions = data.suggestions as { reason: string; label: string; shown: number; clicks: number; adds: number }[];
  const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : "—");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-900">Most sold SKUs</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
            {mostSold.map((row, i) => (
              <li key={i}>
                {row.product?.name ?? "—"} — {row.units} units
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="font-semibold text-zinc-900">Most visited (storefront)</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
            {mostVisited.map((row, i) => (
              <li key={i}>
                {row.product?.name ?? "—"} — {row.views} views
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold text-zinc-900">Cart suggestions (last 30 days)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Which reason behind a “You may also like” suggestion gets clicked and added to cart.
        </p>
        {suggestions.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4">Shown</th>
                  <th className="py-2 pr-4">Clicks</th>
                  <th className="py-2 pr-4">Added to cart</th>
                  <th className="py-2 pr-4">Add rate</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.reason} className="border-b border-zinc-100">
                    <td className="py-2 pr-4">{s.label}</td>
                    <td className="py-2 pr-4">{s.shown}</td>
                    <td className="py-2 pr-4">
                      {s.clicks} <span className="text-xs text-zinc-500">({pct(s.clicks, s.shown)})</span>
                    </td>
                    <td className="py-2 pr-4">{s.adds}</td>
                    <td className="py-2 pr-4 font-medium">{pct(s.adds, s.shown)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">No suggestions shown yet.</p>
        )}
      </div>
    </div>
  );
}
