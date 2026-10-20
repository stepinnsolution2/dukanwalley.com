"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

const verbs: Record<string, string> = {
  PROCESSING: "Start processing",
  SHIPPED: "Mark shipped",
  DELIVERED: "Mark delivered",
  RETURNED: "Mark returned",
  CANCELLED: "Cancel order",
};

/** Lifecycle buttons for staff; the server re-checks every transition. */
export function OrderActions({
  orderId,
  next,
  canOverride,
  allStatuses,
  isCod,
}: {
  orderId: string;
  next: string[];
  canOverride: boolean;
  allStatuses: string[];
  isCod: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [override, setOverride] = useState({ to: "", note: "" });

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "Failed");
      return;
    }
    setNote("");
    router.refresh();
  }

  function act(to: string) {
    if (to === "CANCELLED" && !confirm("Cancel this order? Stock is returned.")) return;
    if (to === "RETURNED" && !confirm(isCod ? "Mark returned? Stock is returned and the sale reversed." : "Mark returned? Stock is returned and the order is flagged for a refund.")) return;
    void send({ to, note: note || undefined, ...(to === "SHIPPED" ? { courier, trackingNumber: tracking } : {}) });
  }

  const field = "rounded border px-2 py-1.5 text-sm";
  return (
    <div className="space-y-3">
      {next.length ? (
        <>
          {next.includes("SHIPPED") ? (
            <div className="flex flex-wrap gap-2">
              <input className={field} placeholder="Courier (e.g. TCS, Leopards, Aramex)" value={courier} onChange={(e) => setCourier(e.target.value)} />
              <input className={field} placeholder="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} />
            </div>
          ) : null}
          <input className={`${field} w-full`} placeholder="Note for the history (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {next.map((to) => (
              <button
                key={to}
                type="button"
                disabled={busy || (to === "SHIPPED" && !courier.trim())}
                onClick={() => act(to)}
                className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${to === "CANCELLED" || to === "RETURNED" ? "border border-red-300 text-red-700" : "bg-teal-700 text-white"}`}
              >
                {verbs[to] ?? to}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-zinc-500">No further steps for this order.</p>
      )}
      {canOverride ? (
        <details className="rounded border border-zinc-200 p-2 text-sm">
          <summary className="cursor-pointer text-zinc-700">Manual override (super admin)</summary>
          <p className="mt-2 text-xs text-zinc-500">Sets the status directly without stock or ledger changes. The reason is recorded.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <select className={field} value={override.to} onChange={(e) => setOverride((o) => ({ ...o, to: e.target.value }))}>
              <option value="">Status…</option>
              {allStatuses.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </select>
            <input className={`${field} flex-1`} placeholder="Reason (required)" value={override.note} onChange={(e) => setOverride((o) => ({ ...o, note: e.target.value }))} />
            <button
              type="button"
              disabled={busy || !override.to || !override.note.trim()}
              onClick={() => confirm("Override the status without side effects?") && void send({ to: override.to, note: override.note, override: true })}
              className="rounded border border-zinc-400 px-3 py-1.5 disabled:opacity-50"
            >
              Override
            </button>
          </div>
        </details>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
