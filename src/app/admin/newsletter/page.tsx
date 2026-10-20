"use client";

import { useCallback, useEffect, useState } from "react";

type Sub = { id: string; email: string; phone: string | null; status: string; source: string | null; createdAt: string };

export default function AdminNewsletterPage() {
  const [filters, setFilters] = useState({ status: "ACTIVE", q: "" });
  const [subs, setSubs] = useState<Sub[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();

  const fetchSubs = useCallback(() => fetch(`/api/admin/newsletter?${qs}`).then((r) => r.json()), [qs]);

  useEffect(() => {
    let ignore = false;
    void fetchSubs().then((j) => {
      if (ignore) return;
      setSubs(j.subscribers ?? []);
      setCounts(j.counts ?? {});
    });
    return () => {
      ignore = true;
    };
  }, [fetchSubs]);

  async function setStatus(id: string, status: string) {
    const res = await fetch("/api/admin/newsletter", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setError(res.ok ? null : "Your role can view subscribers but not change them.");
    const j = await fetchSubs();
    setSubs(j.subscribers ?? []);
    setCounts(j.counts ?? {});
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Newsletter</h1>
        <a href={`/api/admin/newsletter?${qs}&format=csv`} className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm">
          Export CSV
        </a>
      </div>
      <p className="text-sm text-zinc-600">
        {counts.ACTIVE ?? 0} active · {counts.UNSUBSCRIBED ?? 0} unsubscribed. Shoppers subscribe from the site footer.
      </p>
      <div className="flex flex-wrap gap-2">
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="rounded border px-2 py-1.5 text-sm">
          <option value="ACTIVE">Active</option>
          <option value="UNSUBSCRIBED">Unsubscribed</option>
          <option value="">All</option>
        </select>
        <input
          placeholder="Search email"
          defaultValue={filters.q}
          onKeyDown={(e) => e.key === "Enter" && setFilters((f) => ({ ...f, q: (e.target as HTMLInputElement).value }))}
          className="rounded border px-3 py-1.5 text-sm"
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="divide-y rounded-xl border border-zinc-200 bg-white">
        {subs.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span>
              {s.email}
              <span className="block text-xs text-zinc-500">
                {s.source ?? "—"} · {s.createdAt.slice(0, 10)}
                {s.phone ? ` · ${s.phone}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-zinc-500">{s.status.toLowerCase()}</span>
              <button
                type="button"
                onClick={() => setStatus(s.id, s.status === "ACTIVE" ? "UNSUBSCRIBED" : "ACTIVE")}
                className="rounded border px-2 py-1 text-xs"
              >
                {s.status === "ACTIVE" ? "Unsubscribe" : "Resubscribe"}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {subs.length === 0 ? <p className="text-sm text-zinc-500">No subscribers match.</p> : null}
    </div>
  );
}
