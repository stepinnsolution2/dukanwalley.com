"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AD_PLACEMENTS,
  bookingState,
  PAYMENT_STATUSES,
  PLACEMENT_KEYS,
  toPktDay,
  type AdPlacement,
} from "@/lib/ad-placements";

type Booking = {
  id: string;
  placement: AdPlacement;
  imageUrl: string;
  alt: string;
  linkUrl: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  price: number | null;
  paymentStatus: string;
  notes: string | null;
  impressions: number;
  clicks: number;
};
type Company = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  banners: Booking[];
};
type Report = {
  from: string;
  to: string;
  perCompany: { advertiser: string; impressions: number; clicks: number }[];
  perBooking: { id: string; advertiser: string; placement: AdPlacement; alt: string; impressions: number; clicks: number }[];
};

const input = "rounded border border-zinc-300 px-2 py-1 text-sm";
const STATE_STYLE = {
  live: "bg-teal-50 text-teal-800",
  scheduled: "bg-sky-50 text-sky-800",
  ended: "bg-zinc-100 text-zinc-600",
  paused: "bg-amber-50 text-amber-800",
} as const;
const PAYMENT_LABEL: Record<string, string> = { unpaid: "Unpaid", partial: "Partly paid", paid: "Paid" };
const ctr = (views: number, clicks: number) => (views ? `${((clicks / views) * 100).toFixed(1)}%` : "–");
const rs = (n: number | null) => (n == null ? "–" : `Rs ${n.toLocaleString("en-PK")}`);

async function send(url: string, method: string, body?: unknown) {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, error: res.ok ? null : ((j.error as string) ?? "Something went wrong"), data: j };
}

function CompanyFields({ initial, onSubmit, submitLabel }: { initial?: Partial<Company>; onSubmit: (v: Record<string, string>) => void; submitLabel: string }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
      }}
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr_auto]"
    >
      <input name="name" required minLength={2} defaultValue={initial?.name} placeholder="Company name" className={input} />
      <input name="contactName" defaultValue={initial?.contactName ?? ""} placeholder="Contact person" className={input} />
      <input name="phone" defaultValue={initial?.phone ?? ""} placeholder="Phone" className={input} />
      <input name="email" type="email" defaultValue={initial?.email ?? ""} placeholder="Email" className={input} />
      <button className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800">{submitLabel}</button>
      <textarea name="notes" defaultValue={initial?.notes ?? ""} placeholder="Notes (deal terms, agreement…)" rows={2} className={`${input} sm:col-span-2 lg:col-span-5`} />
    </form>
  );
}

function BookingForm({ company, onDone }: { company: Company; onDone: (msg: string, notes?: string[]) => void }) {
  const [placement, setPlacement] = useState<AdPlacement>("home_top");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const spec = AD_PLACEMENTS[placement];
  const today = toPktDay(new Date());

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = new FormData(e.currentTarget);
    body.set("advertiserId", company.id);
    const r = await send("/api/admin/ads", "POST", body);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone(`Booking added for ${company.name}: ${r.data.width}×${r.data.height} banner.`, r.data.notes);
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-3 rounded-lg bg-zinc-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <label className="lg:col-span-2">
        <span className="font-medium">Section</span>
        <select name="placement" value={placement} onChange={(e) => setPlacement(e.target.value as AdPlacement)} className={`mt-1 w-full ${input}`}>
          {PLACEMENT_KEYS.map((p) => (
            <option key={p} value={p}>
              {AD_PLACEMENTS[p].label} ({AD_PLACEMENTS[p].width}×{AD_PLACEMENTS[p].height})
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-zinc-500">
          {spec.where}. Banner image: <strong>{spec.width}×{spec.height}</strong> pixels (or the same shape larger, at least {spec.minWidth} wide).
        </span>
      </label>
      <label className="lg:col-span-2">
        <span className="font-medium">Banner image</span>
        <input name="file" type="file" required accept="image/jpeg,image/png,image/webp,image/avif" className="mt-1 block w-full text-sm" />
      </label>
      <label className="lg:col-span-2">
        <span className="font-medium">Description (alt text)</span>
        <input name="alt" required minLength={3} maxLength={150} placeholder={`e.g. ${company.name} winter sale`} className={`mt-1 w-full ${input}`} />
      </label>
      <label className="lg:col-span-2">
        <span className="font-medium">Link (optional)</span>
        <input name="linkUrl" placeholder="https://company.com or /store/their-store" className={`mt-1 w-full ${input}`} />
      </label>
      <label>
        <span className="font-medium">Show from</span>
        <input name="startDate" type="date" required defaultValue={today} className={`mt-1 w-full ${input}`} />
      </label>
      <label>
        <span className="font-medium">Until (inclusive)</span>
        <input name="endDate" type="date" required className={`mt-1 w-full ${input}`} />
      </label>
      <label>
        <span className="font-medium">Price (Rs)</span>
        <input name="price" inputMode="numeric" placeholder="e.g. 15000" className={`mt-1 w-full ${input}`} />
      </label>
      <label>
        <span className="font-medium">Payment</span>
        <select name="paymentStatus" defaultValue="unpaid" className={`mt-1 w-full ${input}`}>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {PAYMENT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2 lg:col-span-4">
        <span className="font-medium">Notes</span>
        <input name="notes" placeholder="Invoice no., agreement…" className={`mt-1 w-full ${input}`} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-50">
          {busy ? "Checking image…" : "Add booking"}
        </button>
        {error ? <span className="text-red-700">{error}</span> : null}
      </div>
    </form>
  );
}

function BookingRow({ b, onChange }: { b: Booking; onChange: (msg: string | null, error?: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const state = bookingState(b);
  const spec = AD_PLACEMENTS[b.placement];
  const patch = async (body: Record<string, unknown>) => {
    const r = await send(`/api/admin/ads/${b.id}`, "PATCH", body);
    onChange(r.error, !!r.error);
  };

  return (
    <li className="space-y-2 border-t border-zinc-100 py-3 text-sm">
      <div className="flex flex-wrap gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of the stored file */}
        <img src={b.imageUrl} alt={b.alt} style={{ aspectRatio: `${spec.width} / ${spec.height}` }} className="h-20 rounded-md bg-zinc-100 object-cover" />
        <div className="min-w-64 flex-1 space-y-1.5">
          <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATE_STYLE[state]}`}>{state}</span>
            <strong>{spec.label}</strong>
            <span className="text-zinc-500">· {b.alt}</span>
          </p>
          <p className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1">
              From
              <input type="date" defaultValue={toPktDay(b.startsAt)} onChange={(e) => e.target.value && void patch({ startDate: e.target.value })} className={input} />
            </label>
            <label className="flex items-center gap-1">
              Until
              <input type="date" defaultValue={toPktDay(b.endsAt)} onChange={(e) => e.target.value && void patch({ endDate: e.target.value })} className={input} />
            </label>
            <span>{rs(b.price)}</span>
            <select defaultValue={b.paymentStatus} onChange={(e) => void patch({ paymentStatus: e.target.value })} className={input} aria-label="Payment status">
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_LABEL[s]}
                </option>
              ))}
            </select>
          </p>
          <p className="text-zinc-600">
            {b.impressions.toLocaleString()} views · {b.clicks.toLocaleString()} clicks · CTR {ctr(b.impressions, b.clicks)}
            {b.linkUrl ? (
              <>
                {" · "}
                <a href={b.linkUrl} target="_blank" rel="noopener" className="text-teal-700 hover:underline">
                  link
                </a>
              </>
            ) : (
              " · no link"
            )}
          </p>
          <p className="flex flex-wrap gap-3">
            <button type="button" onClick={() => void patch({ isActive: !b.isActive })} className="text-teal-700 hover:underline">
              {b.isActive ? "Pause" : "Resume"}
            </button>
            <button type="button" onClick={() => setEditing(!editing)} className="text-teal-700 hover:underline">
              {editing ? "Close" : "Edit details"}
            </button>
            <label className="cursor-pointer text-teal-700 hover:underline">
              Replace image
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  const body = new FormData();
                  body.set("file", f);
                  const r = await send(`/api/admin/ads/${b.id}`, "POST", body);
                  onChange(r.error ?? "Image replaced", !!r.error);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => confirm("Delete this booking and its statistics?") && void send(`/api/admin/ads/${b.id}`, "DELETE").then((r) => onChange(r.error, !!r.error))}
              className="text-red-700 hover:underline"
            >
              Delete
            </button>
          </p>
        </div>
      </div>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
            void patch(v).then(() => setEditing(false));
          }}
          className="grid gap-2 rounded-lg bg-zinc-50 p-3 sm:grid-cols-2"
        >
          <input name="alt" defaultValue={b.alt} required minLength={3} maxLength={150} placeholder="Description" className={input} />
          <input name="linkUrl" defaultValue={b.linkUrl ?? ""} placeholder="Link (https://… or /…)" className={input} />
          <input name="price" defaultValue={b.price ?? ""} inputMode="numeric" placeholder="Price (Rs)" className={input} />
          <input name="notes" defaultValue={b.notes ?? ""} placeholder="Notes" className={input} />
          <button className="w-fit rounded-lg bg-teal-700 px-3 py-1.5 font-semibold text-white hover:bg-teal-800">Save</button>
        </form>
      ) : null}
    </li>
  );
}

export default function AdvertisingPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; notes?: string[] } | null>(null);
  const [booking, setBooking] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  // Last 30 days by default (computed once).
  const [range, setRange] = useState(() => ({ from: toPktDay(new Date(Date.now() - 29 * 86_400_000)), to: toPktDay(new Date()) }));

  const fetchAll = useCallback(() => fetch("/api/admin/advertisers").then((r) => r.json()), []);
  const reload = useCallback(async () => setCompanies((await fetchAll()).advertisers ?? []), [fetchAll]);
  useEffect(() => {
    let ignore = false;
    void fetchAll().then((j) => {
      if (!ignore) setCompanies(j.advertisers ?? []);
    });
    return () => {
      ignore = true;
    };
  }, [fetchAll]);

  const report$ = useCallback(async () => {
    const r = await fetch(`/api/admin/ads/report?from=${range.from}&to=${range.to}`).then((x) => x.json());
    setReport(r.error ? null : r);
    if (r.error) setMsg({ ok: false, text: r.error });
  }, [range]);

  const after = (text: string | null, error = false, notes?: string[]) => {
    setMsg(text ? { ok: !error, text, notes } : null);
    void reload();
  };

  const live = companies.flatMap((c) => c.banners).filter((b) => bookingState(b) === "live").length;
  const unpaid = companies.flatMap((c) => c.banners).filter((b) => b.paymentStatus !== "paid" && bookingState(b) !== "ended");

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Advertising</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Companies buy time for banners in a section of the site. A booking shows only between its dates (Pakistan
          time) and while it isn&apos;t paused. When several bookings share a section they rotate. Views count when a
          banner is actually on screen; clicks are counted before the visitor is sent to the link.
        </p>
        <p className="mt-2 text-sm">
          <strong>{live}</strong> live booking{live === 1 ? "" : "s"} ·{" "}
          <strong className={unpaid.length ? "text-amber-800" : ""}>{unpaid.length}</strong> current or upcoming not fully paid
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Add a company</h2>
        <CompanyFields
          submitLabel="Add company"
          onSubmit={async (v) => {
            const r = await send("/api/admin/advertisers", "POST", v);
            after(r.error ?? `Added ${v.name}`, !!r.error);
          }}
        />
      </section>

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

      {companies.map((c) => (
        <section key={c.id} className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{c.name}</h2>
              <p className="text-sm text-zinc-600">
                {[c.contactName, c.phone, c.email].filter(Boolean).join(" · ") || "No contact details"}
              </p>
              {c.notes ? <p className="text-xs text-zinc-500">{c.notes}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" onClick={() => setBooking(booking === c.id ? null : c.id)} className="rounded-lg bg-teal-700 px-3 py-1.5 font-semibold text-white hover:bg-teal-800">
                {booking === c.id ? "Close" : "New booking"}
              </button>
              <button type="button" onClick={() => setEditing(editing === c.id ? null : c.id)} className="rounded-lg border border-zinc-300 px-3 py-1.5">
                {editing === c.id ? "Close" : "Edit company"}
              </button>
              <button
                type="button"
                onClick={() =>
                  confirm(`Delete ${c.name} with all ${c.banners.length} bookings and their statistics?`) &&
                  void send(`/api/admin/advertisers/${c.id}`, "DELETE").then((r) => after(r.error ?? `Deleted ${c.name}`, !!r.error))
                }
                className="rounded-lg border border-red-200 px-3 py-1.5 text-red-700"
              >
                Delete
              </button>
            </div>
          </div>
          {editing === c.id ? (
            <div className="mt-3">
              <CompanyFields
                initial={c}
                submitLabel="Save"
                onSubmit={async (v) => {
                  const r = await send(`/api/admin/advertisers/${c.id}`, "PATCH", v);
                  setEditing(null);
                  after(r.error ?? "Saved", !!r.error);
                }}
              />
            </div>
          ) : null}
          {booking === c.id ? (
            <BookingForm
              company={c}
              onDone={(text, notes) => {
                setBooking(null);
                after(text, false, notes);
              }}
            />
          ) : null}
          {c.banners.length ? (
            <ul className="mt-2">
              {c.banners.map((b) => (
                <BookingRow key={`${b.id}-${b.imageUrl}`} b={b} onChange={(text, error) => after(text, error)} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No bookings yet.</p>
          )}
        </section>
      ))}

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Report</h2>
        <div className="mt-2 flex flex-wrap items-end gap-3 text-sm">
          <label>
            From
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className={`ml-1 ${input}`} />
          </label>
          <label>
            To
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className={`ml-1 ${input}`} />
          </label>
          <button type="button" onClick={() => void report$()} className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium hover:border-zinc-900">
            Show report
          </button>
        </div>
        {report ? (
          report.perBooking.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="py-1 pr-3">Company</th>
                    <th className="py-1 pr-3">Section · banner</th>
                    <th className="py-1 pr-3 text-right">Views</th>
                    <th className="py-1 pr-3 text-right">Clicks</th>
                    <th className="py-1 text-right">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {report.perCompany.map((c) => (
                    <tr key={`c-${c.advertiser}`} className="border-t border-zinc-200 font-semibold">
                      <td className="py-1.5 pr-3">{c.advertiser}</td>
                      <td className="py-1.5 pr-3 text-zinc-500">All banners</td>
                      <td className="py-1.5 pr-3 text-right">{c.impressions.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-right">{c.clicks.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{ctr(c.impressions, c.clicks)}</td>
                    </tr>
                  ))}
                  {report.perBooking.map((r) => (
                    <tr key={r.id} className="border-t border-zinc-100">
                      <td className="py-1.5 pr-3">{r.advertiser}</td>
                      <td className="py-1.5 pr-3">
                        {AD_PLACEMENTS[r.placement]?.label ?? r.placement} · {r.alt}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{r.impressions.toLocaleString()}</td>
                      <td className="py-1.5 pr-3 text-right">{r.clicks.toLocaleString()}</td>
                      <td className="py-1.5 text-right">{ctr(r.impressions, r.clicks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">
              No views or clicks between {report.from} and {report.to}.
            </p>
          )
        ) : null}
      </section>
    </div>
  );
}
