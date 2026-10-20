"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { describeError } from "@/components/product-form";

type Vendor = {
  id: string;
  kycStatus: string;
  verificationNotes: string | null;
  nationalId: string | null;
  businessRegNo: string | null;
  taxRegNo: string | null;
  restriction: string;
  suspendedReason: string | null;
  commissionOverrideBps: number | null;
  isTopSeller: boolean;
};

const RESTRICTIONS = [
  { value: "NONE", label: "None — selling and payouts allowed" },
  { value: "SUSPEND_PAYOUTS", label: "Suspend payouts only (keeps selling)" },
  { value: "SUSPEND_SELLING", label: "Suspend selling (products hidden)" },
  { value: "FULL_SUSPEND", label: "Full suspension" },
];

/** Each section is shown only to roles allowed to change it; the API re-checks per field. */
export function VendorControls({
  vendor,
  labels,
  canManage,
  canRestrict,
  canCommission,
}: {
  vendor: Vendor;
  labels: { nationalId: string; businessRegNo: string; taxRegNo: string };
  canManage: boolean;
  canRestrict: boolean;
  canCommission: boolean;
}) {
  const router = useRouter();
  const [kyc, setKyc] = useState({
    kycStatus: vendor.kycStatus,
    verificationNotes: vendor.verificationNotes ?? "",
    nationalId: vendor.nationalId ?? "",
    businessRegNo: vendor.businessRegNo ?? "",
    taxRegNo: vendor.taxRegNo ?? "",
  });
  const [restriction, setRestriction] = useState({ restriction: vendor.restriction, suspendedReason: vendor.suspendedReason ?? "" });
  const [commission, setCommission] = useState(vendor.commissionOverrideBps === null ? "" : String(vendor.commissionOverrideBps / 100));
  const [msg, setMsg] = useState<{ section: string; text: string; ok: boolean } | null>(null);

  async function save(section: string, body: Record<string, unknown>) {
    const res = await fetch("/api/admin/vendors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: vendor.id, ...body }),
    });
    const j = await res.json().catch(() => ({}));
    setMsg({ section, text: res.ok ? "Saved" : describeError(j.error), ok: res.ok });
    if (res.ok) router.refresh();
  }

  const nullIfEmpty = (s: string) => (s.trim() === "" ? null : s.trim());
  const input = "mt-1 w-full rounded border px-3 py-2 text-sm";
  const box = "space-y-2 rounded-xl border border-zinc-200 bg-white p-4 text-sm";
  const note = (section: string) =>
    msg?.section === section ? <p className={msg.ok ? "text-green-700" : "text-red-600"}>{msg.text}</p> : null;

  return (
    <>
      {canManage ? (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={vendor.isTopSeller} onChange={(e) => save("top", { isTopSeller: e.target.checked })} />
            Top seller
          </label>
          <span className="text-zinc-600">Shown under “Top sellers” on the home page.</span>
          {note("top")}
        </section>
      ) : null}
    <div className="grid gap-4 md:grid-cols-3">
      {canManage ? (
        <section className={box}>
          <h2 className="font-semibold">KYC & identity</h2>
          <label className="block">
            Status
            <select className={input} value={kyc.kycStatus} onChange={(e) => setKyc((s) => ({ ...s, kycStatus: e.target.value }))}>
              <option value="PENDING">Pending review</option>
              <option value="APPROVED">Approved — can sell</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
          <label className="block">{labels.nationalId}<input className={input} value={kyc.nationalId} onChange={(e) => setKyc((s) => ({ ...s, nationalId: e.target.value }))} /></label>
          <label className="block">{labels.businessRegNo}<input className={input} value={kyc.businessRegNo} onChange={(e) => setKyc((s) => ({ ...s, businessRegNo: e.target.value }))} /></label>
          <label className="block">
            {labels.taxRegNo} <span className="text-xs text-zinc-500">(empty = not tax registered)</span>
            <input className={input} value={kyc.taxRegNo} onChange={(e) => setKyc((s) => ({ ...s, taxRegNo: e.target.value }))} />
          </label>
          <label className="block">Verification notes<textarea className={input} rows={3} value={kyc.verificationNotes} onChange={(e) => setKyc((s) => ({ ...s, verificationNotes: e.target.value }))} /></label>
          <button
            type="button"
            onClick={() =>
              save("kyc", {
                kycStatus: kyc.kycStatus,
                verificationNotes: nullIfEmpty(kyc.verificationNotes),
                nationalId: nullIfEmpty(kyc.nationalId),
                businessRegNo: nullIfEmpty(kyc.businessRegNo),
                taxRegNo: nullIfEmpty(kyc.taxRegNo),
              })
            }
            className="rounded bg-teal-700 px-3 py-1.5 text-white"
          >
            Save KYC
          </button>
          {note("kyc")}
        </section>
      ) : null}

      {canRestrict ? (
        <section className={box}>
          <h2 className="font-semibold">Restrictions</h2>
          {RESTRICTIONS.map((r) => (
            <label key={r.value} className="flex items-start gap-2">
              <input type="radio" name="restriction" checked={restriction.restriction === r.value} onChange={() => setRestriction((s) => ({ ...s, restriction: r.value }))} className="mt-1" />
              {r.label}
            </label>
          ))}
          <label className="block">
            Reason (internal)
            <input className={input} value={restriction.suspendedReason} onChange={(e) => setRestriction((s) => ({ ...s, suspendedReason: e.target.value }))} />
          </label>
          <button
            type="button"
            onClick={() => {
              if (restriction.restriction !== "NONE" && !restriction.suspendedReason.trim()) {
                setMsg({ section: "restriction", text: "Enter a reason", ok: false });
                return;
              }
              void save("restriction", {
                restriction: restriction.restriction,
                suspendedReason: restriction.restriction === "NONE" ? null : restriction.suspendedReason.trim(),
              });
            }}
            className="rounded bg-red-700 px-3 py-1.5 text-white"
          >
            Apply restriction
          </button>
          {note("restriction")}
        </section>
      ) : null}

      {canCommission ? (
        <section className={box}>
          <h2 className="font-semibold">Commission override</h2>
          <p className="text-xs text-zinc-500">Applies instead of category/global rules (a vendor-specific rule still wins). Empty = use the normal rules.</p>
          <label className="block">
            Commission %
            <input className={input} inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="e.g. 8" />
          </label>
          <button
            type="button"
            onClick={() => {
              const pct = commission.trim() === "" ? null : Number(commission);
              if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
                setMsg({ section: "commission", text: "Enter 0–100", ok: false });
                return;
              }
              void save("commission", { commissionOverrideBps: pct === null ? null : Math.round(pct * 100) });
            }}
            className="rounded bg-teal-700 px-3 py-1.5 text-white"
          >
            Save commission
          </button>
          {note("commission")}
        </section>
      ) : null}
    </div>
    </>
  );
}
