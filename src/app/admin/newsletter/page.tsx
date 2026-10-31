"use client";

import { useCallback, useEffect, useState } from "react";
import { SUBSCRIBER_SOURCE_LABELS } from "./sources";

type Sub = {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  newsletter: boolean;
  source: string | null;
  market: string | null;
  createdAt: string;
};
type Data = {
  subscribers: Sub[];
  total: number;
  counts: Record<string, number>;
  sources: { source: string | null; count: number }[];
  remindersWeek: number;
};

export default function AdminNewsletterPage() {
  const [filters, setFilters] = useState({ status: "ACTIVE", list: "", source: "", q: "" });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();

  const fetchSubs = useCallback(() => fetch(`/api/admin/newsletter?${qs}`).then((r) => r.json() as Promise<Data>), [qs]);

  useEffect(() => {
    let ignore = false;
    void fetchSubs().then((j) => {
      if (!ignore) setData(j);
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
    setError(res.ok ? null : "Your role can view contacts but not change them.");
    setData(await fetchSubs());
  }

  const c = data?.counts ?? {};
  const stats: [string, number, string][] = [
    ["Newsletter subscribers", c.NEWSLETTER ?? 0, "Get newsletters and cart reminders"],
    ["Reminders only", Math.max(0, (c.ACTIVE ?? 0) - (c.NEWSLETTER ?? 0)), "Gave an email (checkout, account) but not for newsletters"],
    ["Unsubscribed", c.UNSUBSCRIBED ?? 0, "Get order emails only"],
    ["Cart reminders, last 7 days", data?.remindersWeek ?? 0, "Emails sent to shoppers who left items in the cart"],
  ];
  const select = "rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-zinc-600">
            Every email address collected on the site: the sign-up box, the footer form, checkout and new accounts.
          </p>
        </div>
        <a href={`/api/admin/newsletter?${qs}&format=csv`} className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm">
          Export CSV
        </a>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, n, help]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{n}</p>
            <p className="mt-1 text-xs text-zinc-500">{help}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={select}>
          <option value="ACTIVE">Active</option>
          <option value="UNSUBSCRIBED">Unsubscribed</option>
          <option value="">All</option>
        </select>
        <select value={filters.list} onChange={(e) => setFilters((f) => ({ ...f, list: e.target.value }))} className={select}>
          <option value="">Everyone</option>
          <option value="newsletter">Newsletter subscribers</option>
          <option value="reminders">Reminders only</option>
        </select>
        <select value={filters.source} onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))} className={select}>
          <option value="">From anywhere</option>
          {(data?.sources ?? []).map((s) => (
            <option key={s.source ?? "none"} value={s.source ?? ""}>
              {SUBSCRIBER_SOURCE_LABELS[s.source ?? ""] ?? s.source ?? "Unknown"} ({s.count})
            </option>
          ))}
        </select>
        <input
          placeholder="Search email, press Enter"
          defaultValue={filters.q}
          onKeyDown={(e) => e.key === "Enter" && setFilters((f) => ({ ...f, q: (e.target as HTMLInputElement).value }))}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm"
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <p className="text-xs text-zinc-500">{data ? `${data.total} matching${data.total > data.subscribers.length ? `, showing the latest ${data.subscribers.length}` : ""}` : "Loading…"}</p>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Gets</th>
              <th className="px-4 py-2">From</th>
              <th className="px-4 py-2">Market</th>
              <th className="px-4 py-2">Added</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(data?.subscribers ?? []).map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-2">
                  {s.email}
                  {s.phone ? <span className="block text-xs text-zinc-500">{s.phone}</span> : null}
                </td>
                <td className="px-4 py-2">
                  {s.status === "UNSUBSCRIBED" ? (
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">Unsubscribed</span>
                  ) : s.newsletter ? (
                    <span className="rounded bg-teal-50 px-2 py-0.5 text-xs text-teal-800">Newsletter</span>
                  ) : (
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Reminders only</span>
                  )}
                </td>
                <td className="px-4 py-2 text-zinc-600">{SUBSCRIBER_SOURCE_LABELS[s.source ?? ""] ?? s.source ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-600">{s.market ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-zinc-600">{s.createdAt.slice(0, 10)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setStatus(s.id, s.status === "ACTIVE" ? "UNSUBSCRIBED" : "ACTIVE")}
                    className="rounded border border-zinc-300 px-2 py-1 text-xs"
                  >
                    {s.status === "ACTIVE" ? "Unsubscribe" : "Resubscribe"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.subscribers.length ? <p className="p-4 text-sm text-zinc-500">No contacts match.</p> : null}
      </div>
    </div>
  );
}
