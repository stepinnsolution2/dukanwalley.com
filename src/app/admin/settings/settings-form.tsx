"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { IntegrationGroup } from "@/lib/integration-fields";

type FieldStatus = { inAdmin: boolean; inEnv: boolean; value?: string };

export function SettingsForm({
  groups,
  status,
  configured,
}: {
  groups: readonly IntegrationGroup[];
  status: Record<string, FieldStatus>;
  configured: Record<string, boolean>;
}) {
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} status={status} configured={configured[g.id]} />
      ))}
    </div>
  );
}

function GroupCard({
  group,
  status,
  configured,
}: {
  group: IntegrationGroup;
  status: Record<string, FieldStatus>;
  configured: boolean;
}) {
  const router = useRouter();
  const initial = Object.fromEntries(group.fields.map((f) => [f.key, f.secret ? "" : (status[f.key]?.value ?? "")]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [remove, setRemove] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    // Only what the owner touched, so values shown from .env aren't copied into the database.
    const changes = Object.fromEntries(
      group.fields
        .filter((f) => remove[f.key] || values[f.key] !== initial[f.key])
        .map((f) => [f.key, remove[f.key] ? null : values[f.key]]),
    );
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: j.error ?? "Could not save" });
      return;
    }
    setMessage({ ok: true, text: j.changed?.length ? "Saved." : "Nothing changed." });
    setValues((v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, group.fields.find((f) => f.key === k)?.secret ? "" : x])));
    setRemove({});
    router.refresh();
  }

  async function testEmail() {
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/admin/settings/test-email", { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: `Test email sent to ${j.to}.` } : { ok: false, text: j.error ?? "Test failed" });
  }

  const input = "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm";
  return (
    <form onSubmit={save} className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-zinc-900">{group.title}</h2>
          <p className="text-sm text-zinc-600">{group.description}</p>
        </div>
        {group.required.length ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              configured ? "bg-teal-50 text-teal-800" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {configured ? "Configured" : "Not configured"}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {group.fields.map((f) => {
          const s = status[f.key] ?? { inAdmin: false, inEnv: false };
          const source = s.inAdmin ? "saved here" : s.inEnv ? "from server .env" : null;
          return (
            <label key={f.key} className="block text-sm">
              <span className="font-medium text-zinc-800">{f.label}</span>
              {source ? <span className="ml-2 text-xs text-zinc-500">({source})</span> : null}
              {f.options ? (
                <select
                  value={values[f.key]}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className={input}
                >
                  <option value="">Default</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.secret ? "password" : "text"}
                  autoComplete={f.secret ? "new-password" : "off"}
                  value={values[f.key]}
                  disabled={!!remove[f.key]}
                  placeholder={f.secret ? (s.inAdmin || s.inEnv ? "•••••••• (leave blank to keep)" : "Not set") : f.placeholder}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className={input}
                />
              )}
              {f.help ? <span className="mt-1 block text-xs text-zinc-500">{f.help}</span> : null}
              {f.secret && s.inAdmin ? (
                <span className="mt-1 flex items-center gap-1.5 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={!!remove[f.key]}
                    onChange={(e) => setRemove({ ...remove, [f.key]: e.target.checked })}
                  />
                  Remove saved value
                </span>
              ) : null}
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          Save {group.title}
        </button>
        {group.id === "email" ? (
          <button
            type="button"
            onClick={testEmail}
            disabled={busy || !configured}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 hover:border-zinc-900 disabled:opacity-50"
          >
            Send test email to me
          </button>
        ) : null}
        {message ? (
          <span role="status" className={`text-sm ${message.ok ? "text-teal-800" : "text-red-700"}`}>
            {message.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
