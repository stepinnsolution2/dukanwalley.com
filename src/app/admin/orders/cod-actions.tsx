"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Confirm / cancel / resend for a cash-on-delivery order awaiting the buyer's confirmation. */
export function CodActions({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function act(action: "confirm" | "cancel" | "resend") {
    if (action === "cancel" && !confirm("Cancel this order and return its stock?")) return;
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/admin/orders/${orderId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setNote(j.error ?? "Failed");
      return;
    }
    if (action === "resend") setNote("Link resent");
    router.refresh();
  }

  const btn = "rounded border px-2 py-1 text-xs disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" disabled={busy} onClick={() => act("confirm")} className={`${btn} border-teal-600 text-teal-800`}>
        Confirm
      </button>
      <button type="button" disabled={busy} onClick={() => act("cancel")} className={`${btn} border-red-300 text-red-700`}>
        Cancel
      </button>
      <button type="button" disabled={busy} onClick={() => act("resend")} className={btn}>
        Resend link
      </button>
      {note ? <span className="text-xs text-zinc-500">{note}</span> : null}
    </div>
  );
}
