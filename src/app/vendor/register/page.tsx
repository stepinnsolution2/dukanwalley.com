"use client";

import Link from "next/link";
import { useState } from "react";
import { DEFAULT_MARKET, MARKET_CODES, MARKETS, type MarketCode } from "@/lib/markets";
import { PAGE_FORM } from "@/lib/page-layout";

export default function VendorRegisterPage() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    phone: "",
    storeName: "",
    addressLine1: "",
    city: "",
    region: "",
    postalCode: "",
    nationalId: "",
    businessRegNo: "",
    taxRegNo: "",
    logoUrl: "",
    bannerUrl: "",
  });
  const [market, setMarket] = useState<MarketCode>(DEFAULT_MARKET);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const m = MARKETS[market];

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "vendor",
        ...form,
        market,
        logoUrl: form.logoUrl || undefined,
        bannerUrl: form.bannerUrl || undefined,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(
        typeof j.error === "string"
          ? j.error
          : `Please check: ${Object.keys(j.error?.fieldErrors ?? {}).join(", ") || "the form"}`,
      );
      return;
    }
    setMsg("Application submitted. Await KYC from admin.");
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));
  const input = "rounded-lg border px-3 py-2 text-sm";

  return (
    <main className={PAGE_FORM}>
      <h1 className="text-2xl font-semibold">Vendor registration</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Store name, phone, ID, and address are required for your storefront profile.
      </p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-zinc-700 sm:col-span-2">
          Country you sell in
          <select
            className={`${input} mt-1 w-full`}
            value={market}
            onChange={(e) => {
              setMarket(e.target.value as MarketCode);
              setForm((s) => ({ ...s, region: "" }));
            }}
          >
            {MARKET_CODES.map((code) => (
              <option key={code} value={code}>
                {MARKETS[code].name} ({MARKETS[code].currency})
              </option>
            ))}
          </select>
        </label>
        <input className={input} placeholder="Store name" value={form.storeName} onChange={f("storeName")} required />
        <input className={input} placeholder="Your name" value={form.name} onChange={f("name")} required />
        <input type="email" className={`${input} sm:col-span-2`} placeholder="Email" value={form.email} onChange={f("email")} required />
        <input type="password" className={`${input} sm:col-span-2`} placeholder="Password (min 8 characters)" value={form.password} onChange={f("password")} required />
        <input type="tel" className={`${input} sm:col-span-2`} placeholder={`Mobile, e.g. ${m.mobileExample}`} value={form.phone} onChange={f("phone")} required />
        <input className={`${input} sm:col-span-2`} placeholder="Business address" value={form.addressLine1} onChange={f("addressLine1")} required />
        <input className={input} placeholder="City" value={form.city} onChange={f("city")} required />
        <select className={input} value={form.region} onChange={f("region")} required>
          <option value="">{m.regionLabel}…</option>
          {m.regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input className={`${input} sm:col-span-2`} placeholder="Postal code (optional)" value={form.postalCode} onChange={f("postalCode")} />
        <input className={`${input} sm:col-span-2`} placeholder={m.idLabels.nationalId} value={form.nationalId} onChange={f("nationalId")} required />
        <input className={input} placeholder={`${m.idLabels.businessRegNo} (optional)`} value={form.businessRegNo} onChange={f("businessRegNo")} />
        <input className={input} placeholder={`${m.idLabels.taxRegNo} (if registered)`} value={form.taxRegNo} onChange={f("taxRegNo")} />
        <input className={`${input} sm:col-span-2`} placeholder="Logo URL (https://...)" value={form.logoUrl} onChange={f("logoUrl")} />
        <input className={`${input} sm:col-span-2`} placeholder="Banner URL (https://...)" value={form.bannerUrl} onChange={f("bannerUrl")} />
        {err ? <p className="sm:col-span-2 text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="sm:col-span-2 text-sm text-green-700">{msg}</p> : null}
        <button type="submit" className="sm:col-span-2 rounded-lg bg-teal-700 py-2.5 text-sm font-semibold text-white">
          Submit
        </button>
      </form>
      <p className="mt-4 text-sm">
        <Link href="/auth/login" className="text-teal-700 hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
