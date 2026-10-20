"use client";

import { useEffect, useState } from "react";
import { formatMoney, type MarketCode } from "@/lib/markets";

type Stats = {
  totalProducts: number;
  pending: number;
  approved: number;
  rejected: number;
  recentViews: number;
  attributedRevenue: { market: MarketCode; amount: number }[];
};

export default function SalesDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/sales/stats");
      if (!res.ok) {
        setStats(null);
        return;
      }
      setStats(await res.json());
    })();
  }, []);

  if (!stats) {
    return <p className="text-sm text-red-600">Could not load stats.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Sales dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ["totalProducts", "My products"],
            ["pending", "Pending review"],
            ["approved", "Approved"],
            ["rejected", "Rejected"],
            ["recentViews", "Product views (all)"],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-teal-900">
              {stats[k] ?? 0}
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm text-zinc-600">
        Attributed revenue (sum of your lines, incl. tax):{" "}
        {stats.attributedRevenue.length === 0 ? (
          <strong>—</strong>
        ) : (
          stats.attributedRevenue.map((r, i) => (
            <strong key={r.market}>
              {i > 0 ? " · " : ""}
              {formatMoney(r.market, r.amount)}
            </strong>
          ))
        )}
      </p>
    </div>
  );
}
