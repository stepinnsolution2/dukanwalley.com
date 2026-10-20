"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { describeError } from "@/components/product-form";
import { DEFAULT_MARKET, MARKET_CODES, MARKETS, type MarketCode } from "@/lib/markets";

/** Staff creates a vendor account directly (spec: vendors can be created from admin side). */
export function CreateVendor() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState<MarketCode>(DEFAULT_MARKET);
  const [f, setF] = useState({
    storeName: "", name: "", email: "", password: "", phone: "", addressLine1: "", city: "", region: "",
    nationalId: "", businessRegNo: "", taxRegNo: "", logoUrl: "", bannerUrl: "",
  });
  const [error, setError] = useState<string | null>(null);
  const m = MARKETS[market];
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = Object.fromEntries(Object.entries({ ...f, market }).filter(([, v]) => v !== ""));
    const res = await fetch("/api/admin/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(describeError(j.error));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white">
        Add vendor
      </button>
    );
  }
  const input = "rounded border px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="grid gap-2 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-2">
      <select className={`${input} sm:col-span-2`} value={market} onChange={(e) => { setMarket(e.target.value as MarketCode); setF((s) => ({ ...s, region: "" })); }}>
        {MARKET_CODES.map((c) => (
          <option key={c} value={c}>{MARKETS[c].name}</option>
        ))}
      </select>
      <input className={input} placeholder="Store name" value={f.storeName} onChange={set("storeName")} required />
      <input className={input} placeholder="Owner name" value={f.name} onChange={set("name")} required />
      <input className={input} type="email" placeholder="Login email" value={f.email} onChange={set("email")} required />
      <input className={input} type="password" placeholder="Temporary password (8+)" value={f.password} onChange={set("password")} required minLength={8} />
      <input className={input} placeholder={`Mobile, e.g. ${m.mobileExample}`} value={f.phone} onChange={set("phone")} required />
      <input className={input} placeholder="Business address" value={f.addressLine1} onChange={set("addressLine1")} required />
      <input className={input} placeholder="City" value={f.city} onChange={set("city")} />
      <select className={input} value={f.region} onChange={set("region")}>
        <option value="">{m.regionLabel}…</option>
        {m.regions.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <input className={input} placeholder={m.idLabels.nationalId} value={f.nationalId} onChange={set("nationalId")} />
      <input className={input} placeholder={m.idLabels.businessRegNo} value={f.businessRegNo} onChange={set("businessRegNo")} />
      <input className={input} placeholder={`${m.idLabels.taxRegNo} (if registered)`} value={f.taxRegNo} onChange={set("taxRegNo")} />
      <input className={input} placeholder="Logo URL (https://…)" value={f.logoUrl} onChange={set("logoUrl")} />
      <input className={`${input} sm:col-span-2`} placeholder="Banner URL (https://…)" value={f.bannerUrl} onChange={set("bannerUrl")} />
      {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}
      <div className="flex gap-2 sm:col-span-2">
        <button className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Create vendor</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border px-4 py-2 text-sm">Cancel</button>
      </div>
      <p className="text-xs text-zinc-500 sm:col-span-2">Vendors created here start with KYC approved.</p>
    </form>
  );
}
