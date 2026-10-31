"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** A template card: name the newsletter and open it in the editor. */
export function NewCampaign({ template }: { template: { id: string; name: string; description: string } }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/admin/newsletter/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: template.id, name: name.trim() || template.name }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(typeof j.error === "string" ? j.error : "Could not create it");
      return;
    }
    router.push(`/admin/newsletter/campaigns/${j.id}`);
  }

  return (
    <form onSubmit={create} className="flex flex-col rounded-xl border border-zinc-200 bg-white p-4">
      <p className="font-semibold">{template.name}</p>
      <p className="mt-1 flex-1 text-sm text-zinc-600">{template.description}</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`Name, e.g. ${template.id === "festival" ? "Eid ul Adha 2027 sale" : template.id === "arrivals" ? "New arrivals – June" : "Eid greeting 2027"}`}
        className="mt-3 rounded border border-zinc-300 px-3 py-1.5 text-sm"
        maxLength={120}
      />
      <button disabled={busy} className="mt-2 rounded bg-teal-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
        Use this template
      </button>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
