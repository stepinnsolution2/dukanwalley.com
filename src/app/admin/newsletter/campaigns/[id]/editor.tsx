"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getTemplate, missingForSend, OCCASIONS, type Slot, type SlotValues } from "@/lib/newsletter-templates";

type Campaign = {
  id: string;
  name: string;
  template: string;
  subject: string;
  preheader: string;
  content: SlotValues;
  market: string;
  personalPicks: boolean;
  status: string;
  recipients: number;
  sentCount: number;
  failedCount: number;
};
type PickedProduct = { id: string; name: string; price: number; imageUrl: string | null };

const input = "w-full rounded border border-zinc-300 px-3 py-1.5 text-sm disabled:bg-zinc-50";
const SWATCHES = ["#0f7a4a", "#01411c", "#7a5c12", "#c2410c", "#b91c1c", "#16325c", "#111827", "#f47b20"];

export function CampaignEditor({ initial, audience, myEmail }: { initial: Campaign; audience: number; myEmail: string }) {
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState("");
  const [mobile, setMobile] = useState(false);
  const [testTo, setTestTo] = useState(myEmail);
  const [occasion, setOccasion] = useState("");
  const template = getTemplate(c.template);
  const editable = c.status === "DRAFT";

  const set = (patch: Partial<Campaign>) => {
    setC((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const setSlot = (key: string, value: string | string[]) => set({ content: { ...c.content, [key]: value } });

  // Live preview, a moment after the last change.
  useEffect(() => {
    const t = window.setTimeout(async () => {
      const res = await fetch("/api/admin/newsletter/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: c.id,
          name: c.name,
          template: c.template,
          subject: c.subject,
          preheader: c.preheader,
          content: c.content,
          market: c.market,
          personalPicks: c.personalPicks,
        }),
      }).catch(() => null);
      const j = await res?.json().catch(() => null);
      if (j?.html) setPreview(j.html);
    }, 700);
    return () => window.clearTimeout(t);
  }, [c.id, c.name, c.template, c.subject, c.preheader, c.content, c.market, c.personalPicks]);

  // Progress while sending.
  useEffect(() => {
    if (c.status !== "SENDING" && c.status !== "QUEUING") return;
    const t = window.setInterval(async () => {
      const j = await fetch(`/api/admin/newsletter/campaigns/${c.id}`).then((r) => r.json()).catch(() => null);
      if (j?.campaign) setC((x) => ({ ...x, ...j.campaign }));
    }, 8000);
    return () => window.clearInterval(t);
  }, [c.status, c.id]);

  const save = useCallback(async () => {
    if (!editable) return true;
    setSaving(true);
    const res = await fetch(`/api/admin/newsletter/campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: c.name,
        subject: c.subject,
        preheader: c.preheader,
        content: c.content,
        market: c.market,
        personalPicks: c.personalPicks,
      }),
    });
    setSaving(false);
    if (res.ok) setDirty(false);
    else setNotice({ ok: false, text: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not save" });
    return res.ok;
  }, [c, editable]);

  async function action(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/newsletter/campaigns/${c.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, j: (await res.json().catch(() => ({}))) as { error?: string; recipients?: number; id?: string } };
  }

  async function sendTest() {
    if (!(await save())) return;
    setNotice(null);
    const { ok, j } = await action({ action: "test", to: testTo });
    setNotice(ok ? { ok: true, text: `Test sent to ${testTo}. It can take a minute to arrive (check spam too).` } : { ok: false, text: j.error ?? "Could not send" });
  }

  async function sendAll() {
    const missing = missingForSend(c);
    if (missing.length) {
      setNotice({ ok: false, text: `Fill in: ${missing.join(", ")}` });
      return;
    }
    if (!window.confirm(`Send "${c.subject}" to ${audience} subscriber${audience === 1 ? "" : "s"}? This can't be undone.`)) return;
    if (!(await save())) return;
    const { ok, j } = await action({ action: "send" });
    if (!ok) {
      setNotice({ ok: false, text: j.error ?? "Could not send" });
      return;
    }
    setC((x) => ({ ...x, status: "SENDING", recipients: j.recipients ?? 0 }));
    setNotice({ ok: true, text: `Sending to ${j.recipients} subscribers. You can leave this page; it carries on in the background.` });
  }

  async function stop() {
    if (!window.confirm("Stop sending? Emails already sent can't be recalled.")) return;
    await action({ action: "cancel" });
    router.refresh();
    setC((x) => ({ ...x, status: "CANCELLED" }));
  }

  async function duplicate() {
    const { ok, j } = await action({ action: "duplicate" });
    if (ok && j.id) router.push(`/admin/newsletter/campaigns/${j.id}`);
  }

  async function remove() {
    if (!window.confirm("Delete this newsletter?")) return;
    const res = await fetch(`/api/admin/newsletter/campaigns/${c.id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/newsletter/campaigns");
  }

  /** Fills only the slots that are still empty (and the theme colour), from a festival preset. */
  function quickFill() {
    const o = OCCASIONS.find((x) => x.id === occasion);
    if (!o) return;
    const content = { ...c.content };
    for (const [k, v] of Object.entries(o.values)) {
      if (!template.slots.some((s) => s.key === k)) continue;
      const cur = content[k];
      if (k === "accent" || !cur || (typeof cur === "string" && !cur.trim())) content[k] = v;
    }
    set({ content, subject: c.subject || o.subject, preheader: c.preheader || o.preheader });
  }

  const progress = c.recipients ? Math.round((c.sentCount / c.recipients) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">{template.name}</p>
          <h1 className="text-2xl font-semibold">{c.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <button onClick={() => void save()} disabled={!dirty || saving} className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50">
              {saving ? "Saving…" : dirty ? "Save draft" : "Saved"}
            </button>
          ) : null}
          <button onClick={duplicate} className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm">
            Duplicate
          </button>
          {c.status !== "SENDING" ? (
            <button onClick={remove} className="rounded border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700">
              Delete
            </button>
          ) : null}
        </div>
      </div>

      {c.status !== "DRAFT" ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <p className="font-medium">
            {c.status === "SENT" ? "Sent" : c.status === "CANCELLED" ? "Stopped" : "Sending…"} · {c.sentCount} of {c.recipients} delivered to the mail server
            {c.failedCount ? ` · ${c.failedCount} failed` : ""}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded bg-zinc-100">
            <div className="h-full bg-teal-600" style={{ width: `${progress}%` }} />
          </div>
          {c.status === "SENDING" ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-500">Goes out in batches every 10 minutes, within the daily limit. Large lists can take a few days.</p>
              <button onClick={stop} className="rounded border border-red-200 px-3 py-1 text-xs text-red-700">
                Stop sending
              </button>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-zinc-500">Sent newsletters can&apos;t be edited. Use Duplicate to make a new one from it.</p>
        </div>
      ) : null}

      {notice ? <p className={`rounded-lg px-3 py-2 text-sm ${notice.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-700"}`}>{notice.text}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <fieldset disabled={!editable} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold">Email</legend>
            <Field label="Name (only you see this)">
              <input className={input} value={c.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Subject line" help="What readers see in their inbox. Keep it short; an emoji is fine.">
              <input className={input} value={c.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={200} />
            </Field>
            <Field label="Preview text" help="The grey line shown after the subject in most inboxes.">
              <input className={input} value={c.preheader} onChange={(e) => set({ preheader: e.target.value })} maxLength={200} />
            </Field>
            <div className="flex flex-wrap gap-4">
              <Field label="Market">
                <select className={input} value={c.market} onChange={(e) => set({ market: e.target.value })}>
                  <option value="PK">Pakistan (PKR)</option>
                  <option value="AE">UAE (AED)</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" checked={c.personalPicks} onChange={(e) => set({ personalPicks: e.target.checked })} />
                Add &quot;Picked for you&quot; products for each reader
              </label>
            </div>
          </fieldset>

          {editable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Festival quick fill</p>
              <p className="text-xs text-amber-800">Suggests wording and a colour for the occasion. Only empty slots are filled, so your own text stays.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <select className={`${input} max-w-xs bg-white`} value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                  <option value="">Choose an occasion…</option>
                  {OCCASIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.when})
                    </option>
                  ))}
                </select>
                <button onClick={quickFill} disabled={!occasion} className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  Fill empty slots
                </button>
              </div>
            </div>
          ) : null}

          <fieldset disabled={!editable} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold">Template slots</legend>
            <p className="text-xs text-zinc-500">Empty slots are left out of the email.</p>
            {template.slots.map((slot) => (
              <SlotInput
                key={slot.key}
                slot={slot}
                value={c.content[slot.key]}
                onChange={(v) => setSlot(slot.key, v)}
                market={c.market}
                editable={editable}
                latestButton={template.id === "arrivals"}
              />
            ))}
          </fieldset>

          <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm font-semibold">Send</p>
            <div className="flex flex-wrap gap-2">
              <input className={`${input} max-w-xs`} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
              <button onClick={sendTest} disabled={!testTo} className="rounded border border-teal-700 px-3 py-1.5 text-sm font-medium text-teal-800 disabled:opacity-50">
                Send me a test
              </button>
            </div>
            {editable ? (
              <button onClick={sendAll} className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white">
                Send to {audience} subscriber{audience === 1 ? "" : "s"}
              </button>
            ) : null}
            <p className="text-xs text-zinc-500">
              Goes to everyone who signed up for newsletters in this market. People who unsubscribed, or only gave an email at checkout without
              ticking the offers box, don&apos;t get it. Every email has an unsubscribe link.
            </p>
          </div>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Preview</p>
            <div className="flex overflow-hidden rounded border border-zinc-300 text-xs">
              <button onClick={() => setMobile(false)} className={`px-3 py-1 ${!mobile ? "bg-zinc-800 text-white" : "bg-white"}`}>
                Desktop
              </button>
              <button onClick={() => setMobile(true)} className={`px-3 py-1 ${mobile ? "bg-zinc-800 text-white" : "bg-white"}`}>
                Phone
              </button>
            </div>
          </div>
          <div className="flex justify-center rounded-xl border border-zinc-200 bg-zinc-100 p-2">
            <iframe
              title="Newsletter preview"
              srcDoc={preview}
              sandbox=""
              className="h-[80vh] rounded bg-white"
              style={{ width: mobile ? 380 : "100%" }}
            />
          </div>
          {c.personalPicks ? (
            <p className="mt-2 text-xs text-zinc-500">
              The &quot;Picked for you&quot; section here shows popular products; each reader gets their own (their cart, what they viewed, similar items).
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-zinc-800">{label}</span>
      <div className="mt-1">{children}</div>
      {help ? <span className="mt-1 block text-xs text-zinc-500">{help}</span> : null}
    </label>
  );
}

function SlotInput({
  slot,
  value,
  onChange,
  market,
  editable,
  latestButton,
}: {
  slot: Slot;
  value: SlotValues[string];
  onChange: (v: string | string[]) => void;
  market: string;
  editable: boolean;
  latestButton: boolean;
}) {
  const text = typeof value === "string" ? value : "";
  if (slot.type === "products") {
    return (
      <ProductsSlot slot={slot} ids={Array.isArray(value) ? value : []} onChange={onChange} market={market} editable={editable} latestButton={latestButton} />
    );
  }
  if (slot.type === "image") return <ImageSlot slot={slot} url={text} onChange={onChange} editable={editable} />;
  if (slot.type === "color") {
    return (
      <Field label={slot.label} help={slot.help}>
        <div className="flex flex-wrap items-center gap-2">
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(text) ? text : "#f47b20"} onChange={(e) => onChange(e.target.value)} className="h-8 w-12 rounded border" />
          {SWATCHES.map((s) => (
            <button key={s} type="button" onClick={() => onChange(s)} className="h-6 w-6 rounded-full border border-white shadow ring-1 ring-zinc-300" style={{ background: s }} aria-label={s} />
          ))}
          {text ? (
            <button type="button" onClick={() => onChange("")} className="text-xs text-zinc-500 underline">
              Default
            </button>
          ) : null}
        </div>
      </Field>
    );
  }
  return (
    <Field label={slot.label} help={slot.help}>
      {slot.type === "textarea" ? (
        <textarea className={input} rows={4} value={text} placeholder={slot.placeholder} onChange={(e) => onChange(e.target.value)} maxLength={5000} />
      ) : (
        <input className={input} value={text} placeholder={slot.placeholder} onChange={(e) => onChange(e.target.value)} maxLength={slot.type === "url" ? 500 : 200} />
      )}
    </Field>
  );
}

function ImageSlot({ slot, url, onChange, editable }: { slot: Slot; url: string; onChange: (v: string) => void; editable: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/uploads?kind=image", { method: "POST", body: file });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && j.url) onChange(j.url);
    else setError(typeof j.error === "string" ? j.error : "Upload failed");
  }

  return (
    <Field label={slot.label} help={slot.help}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="mb-2 max-h-40 rounded border border-zinc-200 object-contain" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        {editable ? (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="rounded border border-zinc-300 px-3 py-1.5 text-sm">
            {busy ? "Uploading…" : url ? "Replace image" : "Upload image"}
          </button>
        ) : null}
        {url && editable ? (
          <button type="button" onClick={() => onChange("")} className="text-sm text-red-700 underline">
            Remove
          </button>
        ) : null}
      </div>
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </Field>
  );
}

function ProductsSlot({
  slot,
  ids,
  onChange,
  market,
  editable,
  latestButton,
}: {
  slot: Slot;
  ids: string[];
  onChange: (v: string[]) => void;
  market: string;
  editable: boolean;
  latestButton: boolean;
}) {
  const max = slot.max ?? 8;
  const [known, setKnown] = useState<Record<string, PickedProduct>>({});
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedProduct[]>([]);

  const remember = (list: PickedProduct[]) => setKnown((k) => ({ ...k, ...Object.fromEntries(list.map((p) => [p.id, p])) }));

  // Names and photos for products picked earlier (each asked for once, even if since deleted).
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const missing = ids.filter((id) => !known[id] && !asked.current.has(id));
    if (!missing.length) return;
    for (const id of missing) asked.current.add(id);
    void fetch(`/api/admin/newsletter/products?ids=${missing.join(",")}&market=${market}`)
      .then((r) => r.json())
      .then((j) => remember(j.products ?? []));
  }, [ids, known, market]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      void fetch(`/api/admin/newsletter/products?q=${encodeURIComponent(q)}&market=${market}`)
        .then((r) => r.json())
        .then((j) => setResults(j.products ?? []));
    }, 300);
    return () => window.clearTimeout(t);
  }, [q, market]);

  async function fillLatest() {
    const j = await fetch(`/api/admin/newsletter/products?latest=1&market=${market}`).then((r) => r.json());
    const list: PickedProduct[] = j.products ?? [];
    remember(list);
    onChange(list.slice(0, max).map((p) => p.id));
  }

  const move = (i: number, d: number) => {
    const next = [...ids];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };

  return (
    <div className="text-sm">
      <p className="font-medium text-zinc-800">
        {slot.label} <span className="font-normal text-zinc-500">({ids.length}/{max})</span>
      </p>
      {slot.help ? <p className="text-xs text-zinc-500">{slot.help}</p> : null}
      <ul className="mt-2 space-y-1">
        {ids.map((id, i) => {
          const p = known[id];
          return (
            <li key={id} className="flex items-center gap-2 rounded border border-zinc-200 p-1.5">
              {p?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="h-9 w-9 rounded object-cover" />
              ) : (
                <span className="h-9 w-9 rounded bg-zinc-100" />
              )}
              <span className="flex-1 truncate">{p?.name ?? "Loading…"}</span>
              {editable ? (
                <span className="flex gap-1 text-xs">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded border px-1.5 disabled:opacity-30" aria-label="Move up">
                    ↑
                  </button>
                  <button type="button" disabled={i === ids.length - 1} onClick={() => move(i, 1)} className="rounded border px-1.5 disabled:opacity-30" aria-label="Move down">
                    ↓
                  </button>
                  <button type="button" onClick={() => onChange(ids.filter((x) => x !== id))} className="rounded border px-1.5 text-red-700" aria-label="Remove">
                    ✕
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {editable ? (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={ids.length >= max ? "Remove one to add another" : "Search products to add…"} disabled={ids.length >= max} />
            {latestButton ? (
              <button type="button" onClick={fillLatest} className="whitespace-nowrap rounded border border-zinc-300 px-3 py-1.5 text-xs">
                Fill with latest arrivals
              </button>
            ) : null}
          </div>
          {results.length ? (
            <ul className="max-h-60 overflow-y-auto rounded border border-zinc-200">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={ids.includes(p.id) || ids.length >= max}
                    onClick={() => {
                      remember([p]);
                      onChange([...ids, p.id]);
                    }}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-zinc-50 disabled:opacity-40"
                  >
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <span className="h-8 w-8 rounded bg-zinc-100" />
                    )}
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-zinc-500">{ids.includes(p.id) ? "Added" : "Add"}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
