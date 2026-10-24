"use client";

import { useCallback, useEffect, useState } from "react";
import { toPktDay } from "@/lib/ad-placements";

type Banner = {
  id: string;
  imageUrl: string;
  alt: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

function state(b: Banner) {
  const now = Date.now();
  if (!b.isActive) return { label: "Off", cls: "bg-zinc-100 text-zinc-600" };
  if (b.startsAt && now < new Date(b.startsAt).getTime()) return { label: "Scheduled", cls: "bg-sky-50 text-sky-800" };
  if (b.endsAt && now > new Date(b.endsAt).getTime()) return { label: "Ended", cls: "bg-zinc-100 text-zinc-600" };
  return { label: "Showing", cls: "bg-teal-50 text-teal-800" };
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return res.ok ? null : (j.error ?? "Something went wrong");
}

export default function BannersPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; notes?: string[] } | null>(null);

  const fetchAll = useCallback(() => fetch("/api/admin/banners").then((r) => r.json()), []);
  const reload = useCallback(async () => setBanners((await fetchAll()).banners ?? []), [fetchAll]);
  useEffect(() => {
    let ignore = false;
    void fetchAll().then((j) => {
      if (!ignore) setBanners(j.banners ?? []);
    });
    return () => {
      ignore = true;
    };
  }, [fetchAll]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMsg(null);
    const body = new FormData();
    body.set("file", file);
    body.set("alt", alt);
    const res = await fetch("/api/admin/banners", { method: "POST", body });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Upload failed" });
    setMsg({ ok: true, text: `Added: ${j.width}×${j.height} WebP, ${Math.round(j.bytes / 1024)} KB.`, notes: j.notes });
    setFile(null);
    setAlt("");
    (e.target as HTMLFormElement).reset();
    await reload();
  }

  async function update(id: string, patch: Record<string, unknown>) {
    const err = await send(`/api/admin/banners/${id}`, "PATCH", patch);
    setMsg(err ? { ok: false, text: err } : null);
    await reload();
  }

  const input = "rounded border border-zinc-300 px-2 py-1 text-sm";
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Home page banners</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Rotating images behind the headline and search box at the top of the home page. Use wide images, ideally
          1800×560 pixels (at least 1200 wide); they are smart-cropped to fit and saved as light WebP. The left side
          is darkened slightly so the white headline stays readable, so keep important details towards the right.
        </p>
      </div>

      <form onSubmit={upload} className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm">
          <span className="font-medium">Image</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="font-medium">Description (alt text)</span>
          <input
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            required
            minLength={3}
            maxLength={150}
            placeholder="e.g. Eid collection of embroidered lawn suits"
            className={`mt-1 w-full ${input}`}
          />
        </label>
        <button disabled={busy || !file} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
          {busy ? "Checking…" : "Add banner"}
        </button>
      </form>
      {msg ? (
        <div role="status" className={`text-sm ${msg.ok ? "text-teal-800" : "text-red-700"}`}>
          {msg.text}
          {msg.notes?.map((n) => (
            <p key={n} className="text-xs text-amber-800">
              {n}
            </p>
          ))}
        </div>
      ) : null}

      {banners.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600">
          No banners yet: the home page shows the brand colour background until you add one.
        </p>
      ) : (
        <ul className="space-y-3">
          {banners.map((b) => {
            const s = state(b);
            return (
              <li key={b.id} className="flex flex-wrap gap-4 rounded-xl border border-zinc-200 bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of the stored file */}
                <img src={b.imageUrl} alt={b.alt} className="aspect-[45/14] w-72 rounded-lg object-cover" />
                <div className="min-w-64 flex-1 space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
                    <input
                      defaultValue={b.alt}
                      onBlur={(e) => e.target.value.trim() !== b.alt && void update(b.id, { alt: e.target.value })}
                      aria-label="Description"
                      className={`min-w-56 flex-1 ${input}`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={b.isActive} onChange={(e) => void update(b.id, { isActive: e.target.checked })} />
                      On
                    </label>
                    <label className="flex items-center gap-1.5">
                      Order
                      <input
                        defaultValue={b.sortOrder}
                        inputMode="numeric"
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isInteger(n) && n >= 0 && n !== b.sortOrder) void update(b.id, { sortOrder: n });
                        }}
                        className={`w-16 ${input}`}
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      From
                      <input
                        type="date"
                        defaultValue={toPktDay(b.startsAt)}
                        onChange={(e) => void update(b.id, { startDate: e.target.value || null })}
                        className={input}
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      Until
                      <input
                        type="date"
                        defaultValue={toPktDay(b.endsAt)}
                        onChange={(e) => void update(b.id, { endDate: e.target.value || null })}
                        className={input}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => confirm("Delete this banner?") && void send(`/api/admin/banners/${b.id}`, "DELETE").then(reload)}
                      className="text-red-700 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500">Leave the dates empty to show it until you switch it off. Lower order shows first.</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
