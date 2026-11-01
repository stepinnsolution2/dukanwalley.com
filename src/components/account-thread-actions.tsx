"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const PAYMENT_METHODS = ["Bank transfer", "JazzCash", "Easypaisa", "Cash", "Cheque", "Other"];

export function ConfirmPaymentButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/vendor/account/${id}/confirm`, { method: "POST" });
        router.refresh();
      }}
      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
    >
      ✓ I received this payment
    </button>
  );
}

export function VoidPaymentButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        const reason = window.prompt("Void this payment? It stays in the thread but no longer counts. Reason:");
        if (!reason || reason.trim().length < 3) return;
        const res = await fetch(`/api/admin/payouts/entries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ voidReason: reason }),
        });
        if (!res.ok) window.alert(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not void");
        router.refresh();
      }}
      className="text-xs text-red-700 underline"
    >
      Void payment
    </button>
  );
}

/**
 * Write box under the thread. Admins can switch to "Record payment" (amount, method, reference,
 * date); both sides can attach screenshots or PDFs.
 */
export function AccountComposer({ endpoint, canPay, currency }: { endpoint: string; canPay: boolean; currency: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"MESSAGE" | "PAYMENT">("MESSAGE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm";
  // Pakistan date, fixed on first render.
  const [today] = useState(() => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    data.set("kind", kind);
    data.delete("files");
    for (const f of files) data.append("files", f);
    const res = await fetch(endpoint, { method: "POST", body: data });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not send");
      return;
    }
    formRef.current?.reset();
    setFiles([]);
    setKind("MESSAGE");
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      {canPay ? (
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm">
          {(["MESSAGE", "PAYMENT"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 rounded-md px-3 py-1.5 font-medium ${kind === k ? "bg-white shadow-sm" : "text-zinc-600"}`}
            >
              {k === "MESSAGE" ? "💬 Message" : "💸 Record payment"}
            </button>
          ))}
        </div>
      ) : null}
      {kind === "PAYMENT" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-medium">Amount paid ({currency})</span>
            <input name="amount" type="number" min="1" step="1" required className={input} placeholder="e.g. 15000" />
          </label>
          <label className="text-sm">
            <span className="font-medium">Paid on</span>
            <input name="paidOn" type="date" defaultValue={today} max={today} className={input} />
          </label>
          <label className="text-sm">
            <span className="font-medium">Method</span>
            <select name="method" className={input} defaultValue="Bank transfer">
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium">Reference / transaction ID</span>
            <input name="reference" maxLength={120} className={input} placeholder="optional" />
          </label>
        </div>
      ) : null}
      <textarea
        name="body"
        rows={3}
        maxLength={4000}
        className={input}
        placeholder={kind === "PAYMENT" ? "Comment, e.g. 50% advance for orders delivered 1–7 Nov" : "Write a message…"}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="cursor-pointer text-sm text-teal-800 underline">
          📎 Attach screenshot or PDF
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              setFiles((f) => [...f, ...picked].slice(0, 5));
              e.target.value = "";
            }}
          />
        </label>
        <button disabled={busy} className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Sending…" : kind === "PAYMENT" ? "Record payment" : "Send"}
        </button>
      </div>
      {files.length ? (
        <ul className="flex flex-wrap gap-2 text-xs">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-1 rounded-full border border-zinc-300 px-2 py-1">
              {f.name}
              <button type="button" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="text-zinc-500" aria-label="Remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </form>
  );
}
