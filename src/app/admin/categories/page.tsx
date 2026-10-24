"use client";

import { useCallback, useEffect, useState } from "react";
import { describeError } from "@/components/product-form";

type Attr = { key: string; name: string; dataType: string; required: boolean; options: string[]; isVariant: boolean };
type Category = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  attributeDefs: Attr[];
  _count: { products: number; children: number };
};

const TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / no" },
  { value: "select", label: "List of options" },
];

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return res.ok ? null : describeError(j.error);
}

function AttributeEditor({ category, onSaved }: { category: Category; onSaved: () => void }) {
  const [rows, setRows] = useState<(Attr & { optionsText: string })[]>(
    category.attributeDefs.map((a) => ({
      ...a,
      dataType: a.dataType === "string" ? "text" : a.dataType,
      optionsText: a.options.join(", "),
    })),
  );
  const [msg, setMsg] = useState<string | null>(null);
  const update = (i: number, patch: Partial<Attr & { optionsText: string }>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  async function save() {
    const err = await send(`/api/admin/categories/${category.id}/attributes`, "PUT", {
      attributes: rows.map((r) => ({
        name: r.name,
        key: r.key,
        dataType: r.dataType,
        required: r.required,
        isVariant: r.isVariant && r.dataType !== "boolean",
        options: r.optionsText.split(",").map((o) => o.trim()).filter(Boolean),
      })),
    });
    setMsg(err ?? "Saved");
    if (!err) onSaved();
  }

  const cell = "rounded border px-2 py-1 text-sm";
  return (
    <div className="mt-3 space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input
            className={cell}
            placeholder="Name (e.g. Size)"
            value={r.name}
            onChange={(e) => {
              const name = e.target.value;
              // Suggest a key from the name until the key is edited by hand.
              const auto = r.key === "" || r.key === r.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
              update(i, { name, ...(auto ? { key: name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") } : {}) });
            }}
          />
          <input className={`${cell} w-28 font-mono`} placeholder="key" value={r.key} onChange={(e) => update(i, { key: e.target.value })} />
          <select className={cell} value={r.dataType} onChange={(e) => update(i, { dataType: e.target.value })}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {r.dataType === "select" ? (
            <input className={`${cell} min-w-48 flex-1`} placeholder="Options, comma separated" value={r.optionsText} onChange={(e) => update(i, { optionsText: e.target.value })} />
          ) : null}
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={r.required} onChange={(e) => update(i, { required: e.target.checked })} />
            Required
          </label>
          {r.dataType !== "boolean" ? (
            <label
              className="flex items-center gap-1 text-sm"
              title="Products list several values (e.g. sizes 39–44) with stock for each, and shoppers pick one"
            >
              <input type="checkbox" checked={r.isVariant} onChange={(e) => update(i, { isVariant: e.target.checked })} />
              Shopper chooses
            </label>
          ) : null}
          <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="text-sm text-red-600">
            Remove
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRows((x) => [...x, { key: "", name: "", dataType: "text", required: false, isVariant: false, options: [], optionsText: "" }])}
          className="rounded border px-3 py-1 text-sm"
        >
          Add field
        </button>
        <button type="button" onClick={save} className="rounded bg-teal-700 px-3 py-1 text-sm text-white">
          Save fields
        </button>
        {msg ? <span className="text-sm text-zinc-600">{msg}</span> : null}
      </div>
    </div>
  );
}

/** Category page text, also used as its search description (the first ~155 characters). */
function DescriptionEditor({ category, onSaved }: { category: Category; onSaved: () => void }) {
  const [text, setText] = useState(category.description ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    const err = await send(`/api/admin/categories/${category.id}`, "PATCH", { description: text });
    setMsg(err ?? "Saved");
    if (!err) onSaved();
  }
  return (
    <div className="mt-3 space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder="What shoppers find in this category and what to check before buying"
        className="w-full rounded border px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={save} className="rounded bg-teal-700 px-3 py-1 text-white">
          Save description
        </button>
        <span className="text-xs text-zinc-500">{text.length} characters · the first ~155 appear in Google results</span>
        {msg ? <span className="text-zinc-600">{msg}</span> : null}
      </div>
    </div>
  );
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [describing, setDescribing] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(() => fetch("/api/admin/categories").then((r) => r.json()), []);
  const reload = useCallback(async () => setCategories((await fetchAll()).categories ?? []), [fetchAll]);

  useEffect(() => {
    let ignore = false;
    void fetchAll().then((j) => {
      if (!ignore) setCategories(j.categories ?? []);
    });
    return () => {
      ignore = true;
    };
  }, [fetchAll]);

  async function run(p: Promise<string | null>) {
    const err = await p;
    setError(err);
    if (!err) await reload();
  }

  const byId = new Map(categories.map((c) => [c.id, c]));
  const path = (c: Category): string => (c.parentId && byId.get(c.parentId) ? `${path(byId.get(c.parentId)!)} › ${c.name}` : c.name);
  const sorted = [...categories].sort((a, b) => path(a).localeCompare(path(b)));
  /** Fields a subcategory gets from its parents (its own definition of a key wins). */
  const inherited = (c: Category): Attr[] => {
    const own = new Set(c.attributeDefs.map((a) => a.key));
    const out: Attr[] = [];
    const seen = new Set([c.id]);
    for (let p = c.parentId ? byId.get(c.parentId) : undefined; p && !seen.has(p.id); p = p.parentId ? byId.get(p.parentId) : undefined) {
      seen.add(p.id);
      for (const a of p.attributeDefs) if (!own.has(a.key) && !out.some((o) => o.key === a.key)) out.push(a);
    }
    return out;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Categories</h1>
      <p className="text-sm text-zinc-600">
        Fields defined here (e.g. Size for Shoes, Storage for Mobile Phones) appear on the product form for that
        category and all categories inside it (Shoes › Women also gets Size). Required fields must be filled before
        a product can be saved.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(send("/api/admin/categories", "POST", { name: newName, parentId: newParent || null })).then(() => setNewName(""));
        }}
        className="flex flex-wrap gap-2"
      >
        <input className="rounded border px-3 py-1.5 text-sm" placeholder="New category name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        <select className="rounded border px-2 py-1.5 text-sm" value={newParent} onChange={(e) => setNewParent(e.target.value)}>
          <option value="">Top level</option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id}>
              Inside: {path(c)}
            </option>
          ))}
        </select>
        <button className="rounded bg-teal-700 px-3 py-1.5 text-sm text-white">Add category</button>
      </form>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <ul className="space-y-2">
        {sorted.map((c) => (
          <li key={c.id} className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{path(c)}</p>
                <p className="text-xs text-zinc-500">
                  {c._count.products} products · {c.attributeDefs.length} fields
                  {c.attributeDefs.length ? `: ${c.attributeDefs.map((a) => a.name + (a.required ? "*" : "")).join(", ")}` : ""}
                </p>
                {inherited(c).length ? (
                  <p className="text-xs text-zinc-500">
                    Also uses from parent: {inherited(c).map((a) => a.name + (a.required ? "*" : "")).join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="rounded border px-2 py-1">
                  {open === c.id ? "Close" : "Fields"}
                </button>
                <button
                  type="button"
                  onClick={() => setDescribing(describing === c.id ? null : c.id)}
                  className="rounded border px-2 py-1"
                >
                  {describing === c.id ? "Close" : c.description ? "Description" : "Add description"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const name = prompt("Rename category", c.name);
                    if (name && name !== c.name) void run(send(`/api/admin/categories/${c.id}`, "PATCH", { name }));
                  }}
                  className="rounded border px-2 py-1"
                >
                  Rename
                </button>
                <select
                  aria-label="Move under"
                  value={c.parentId ?? ""}
                  onChange={(e) => void run(send(`/api/admin/categories/${c.id}`, "PATCH", { parentId: e.target.value || null }))}
                  className="rounded border px-1 py-1"
                >
                  <option value="">Top level</option>
                  {sorted
                    .filter((o) => o.id !== c.id)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        Inside {path(o)}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={c._count.products > 0 || c._count.children > 0}
                  title={c._count.products || c._count.children ? "Only empty categories can be deleted" : undefined}
                  onClick={() => confirm(`Delete ${c.name}?`) && void run(send(`/api/admin/categories/${c.id}`, "DELETE"))}
                  className="rounded border border-red-200 px-2 py-1 text-red-700 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
            {open === c.id ? <AttributeEditor key={c.attributeDefs.map((a) => a.key).join()} category={c} onSaved={reload} /> : null}
            {describing === c.id ? <DescriptionEditor category={c} onSaved={reload} /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
