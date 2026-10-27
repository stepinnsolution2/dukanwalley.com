"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Result = { ref: string; title: string; action: "created" | "updated" | "skipped"; detail: string; productId?: string };
type JobSummary = {
  id: string;
  fileName: string;
  status: string;
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  createdAt: string;
};
type Job = JobSummary & {
  storeName: string;
  stockPerItem: number;
  showStockCount: boolean;
  preview: Result[];
  results: Result[] | null;
  error: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  preview: "Preview — not imported yet",
  running: "Importing…",
  done: "Finished",
  failed: "Failed",
  interrupted: "Interrupted",
};

function count(rows: Result[], action: Result["action"]) {
  return rows.filter((r) => r.action === action).length;
}

export default function ImportPage() {
  const [stores, setStores] = useState<{ id: string; storeName: string }[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [stock, setStock] = useState("50");
  const [showCount, setShowCount] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const fetchList = useCallback(() => fetch("/api/admin/imports").then((r) => r.json()), []);
  const applyList = useCallback((j: { stores?: typeof stores; jobs?: JobSummary[]; houseStoreId?: string }) => {
    setStores(j.stores ?? []);
    setJobs(j.jobs ?? []);
    setVendorId((v) => v || j.houseStoreId || "");
  }, []);
  const loadList = useCallback(async () => applyList(await fetchList()), [applyList, fetchList]);

  const loadJob = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/admin/imports/${id}`);
      if (!res.ok) return;
      const next: Job = (await res.json()).job;
      setJob(next);
      // Finished: refresh the "Recent imports" counts too.
      if (next.status !== "running" && next.status !== "preview") void loadList();
    },
    [loadList],
  );

  useEffect(() => {
    let ignore = false;
    void fetchList().then((j) => {
      if (!ignore) applyList(j);
    });
    return () => {
      ignore = true;
    };
  }, [fetchList, applyList]);

  // Poll while the import runs.
  useEffect(() => {
    if (job?.status !== "running") return;
    const t = setInterval(() => void loadJob(job.id), 2000);
    return () => clearInterval(t);
  }, [job?.id, job?.status, loadJob]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("vendorId", vendorId);
    body.set("stockPerItem", stock);
    body.set("showStockCount", showCount ? "1" : "0");
    const res = await fetch("/api/admin/imports", { method: "POST", body });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Upload failed");
    setShowAll(false);
    await loadJob(j.id);
    void loadList();
  }

  async function start() {
    if (!job) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/imports/${job.id}`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(j.error ?? "Could not start the import");
    await loadJob(job.id);
  }

  const rows = job ? (job.status === "preview" ? job.preview : (job.results ?? [])) : [];
  const visible = showAll ? rows : rows.filter((r) => r.action === "skipped").concat(rows.filter((r) => r.action !== "skipped")).slice(0, 50);
  const canStart = job && ["preview", "failed", "interrupted"].includes(job.status);
  const toImport = job ? count(job.preview, "created") + count(job.preview, "updated") : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/admin/products" className="text-sm text-teal-700 hover:underline">
          ← Products
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Import from Markaz</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Upload a Markaz product export (Excel .xlsx or .csv). You&apos;ll see a preview first; nothing is saved until you
          click Import. New products arrive in <strong>Pending review</strong>. Re-uploading a newer file only updates
          prices of products already imported.
        </p>
      </div>

      <form onSubmit={upload} className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-[1fr_14rem_8rem_auto] sm:items-end">
        <label className="block text-sm">
          <span className="font-medium">File</span>
          <input
            type="file"
            accept=".xlsx,.csv"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Import into store</span>
          <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5">
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.storeName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Stock per item</span>
          <input
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Shoppers see</span>
          <select
            value={showCount ? "count" : "in-stock"}
            onChange={(e) => setShowCount(e.target.value === "count")}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5"
          >
            <option value="count">Stock quantity</option>
            <option value="in-stock">Only “In stock”</option>
          </select>
        </label>
        <button disabled={busy || !file} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
          {busy && !job ? "Reading file…" : "Preview"}
        </button>
      </form>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {job ? (
        <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{job.fileName}</h2>
              <p className="text-sm text-zinc-600">
                {STATUS_LABEL[job.status] ?? job.status} · {job.total} products · into {job.storeName} · stock {job.stockPerItem} each{job.showStockCount ? "" : " (shown as “In stock”)"}
              </p>
            </div>
            {canStart ? (
              <button
                type="button"
                onClick={start}
                disabled={busy || toImport === 0}
                className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {job.status === "preview" ? `Import ${toImport} product${toImport === 1 ? "" : "s"}` : "Resume import"}
              </button>
            ) : null}
          </div>

          {job.status === "preview" ? (
            <p className="text-sm">
              <strong>{count(job.preview, "created")}</strong> new · <strong>{count(job.preview, "updated")}</strong> already imported
              (prices refreshed) · <strong className="text-amber-800">{count(job.preview, "skipped")}</strong> will be skipped
            </p>
          ) : (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full bg-teal-600 transition-all" style={{ width: `${job.total ? (job.processed / job.total) * 100 : 0}%` }} />
              </div>
              <p className="text-sm">
                {job.processed} / {job.total} done · <strong>{job.created}</strong> created · <strong>{job.updated}</strong> updated ·{" "}
                <strong className="text-amber-800">{job.skipped}</strong> skipped
                {job.status === "running" ? " · downloading images, you can leave this page" : ""}
              </p>
              {job.status === "done" && job.created ? (
                <Link href="/admin/products" className="text-sm font-medium text-teal-700 hover:underline">
                  Review the new products in Pending review →
                </Link>
              ) : null}
              {job.status === "interrupted" ? (
                <p className="text-sm text-amber-800">The server restarted during this import. Resume it: products already imported are recognised, not duplicated.</p>
              ) : null}
              {job.error ? <p className="text-sm text-red-700">Error: {job.error}</p> : null}
            </div>
          )}

          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="py-1 pr-3">Result</th>
                    <th className="py-1 pr-3">Product</th>
                    <th className="py-1">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.ref} className="border-t border-zinc-100 align-top">
                      <td className={`py-1.5 pr-3 font-medium ${r.action === "skipped" ? "text-amber-800" : "text-teal-800"}`}>
                        {r.action === "created" && job.status === "preview" ? "new" : r.action}
                      </td>
                      <td className="py-1.5 pr-3">
                        {r.productId ? (
                          <Link href={`/admin/products/${r.productId}`} className="hover:underline">
                            {r.title}
                          </Link>
                        ) : (
                          r.title
                        )}
                      </td>
                      <td className="py-1.5 text-zinc-600">{r.detail.replace(/^\(dry run\) /, "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > visible.length ? (
                <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-sm text-teal-700 hover:underline">
                  Show all {rows.length} rows
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {jobs.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent imports</h2>
          <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white text-sm">
            {jobs.map((j) => (
              <li key={j.id}>
                <button type="button" onClick={() => void loadJob(j.id)} className="flex w-full flex-wrap justify-between gap-2 px-4 py-2 text-left hover:bg-zinc-50">
                  <span className="font-medium">{j.fileName}</span>
                  <span className="text-zinc-600">
                    {STATUS_LABEL[j.status] ?? j.status} · {j.created} created · {j.updated} updated · {j.skipped} skipped ·{" "}
                    {new Date(j.createdAt).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
