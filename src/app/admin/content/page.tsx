"use client";

import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";

type Item = {
  id: string;
  kind: "page" | "post";
  slug: string;
  title: string;
  body: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  status: "draft" | "published";
  seoTitle: string | null;
  seoDescription: string | null;
  showInFooter: boolean;
  footerOrder: number;
  publishedAt: string | null;
  updatedAt: string;
};
type Draft = Omit<Item, "id" | "coverImageUrl" | "publishedAt" | "updatedAt"> & { id?: string; coverImageUrl?: string | null };

const blank = (kind: "page" | "post"): Draft => ({
  kind,
  slug: "",
  title: "",
  body: "",
  excerpt: "",
  status: "draft",
  seoTitle: "",
  seoDescription: "",
  showInFooter: kind === "page",
  footerOrder: 100,
});
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const input = "w-full rounded-lg border px-3 py-1.5 text-sm";

export default function ContentAdmin() {
  const [items, setItems] = useState<Item[]>([]);
  const [tab, setTab] = useState<"page" | "post">("page");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = useCallback(() => fetch("/api/admin/content").then((r) => r.json()), []);
  const reload = useCallback(async () => setItems((await fetchAll()).items ?? []), [fetchAll]);
  useEffect(() => {
    let ignore = false;
    void fetchAll().then((j) => {
      if (!ignore) setItems(j.items ?? []);
    });
    return () => {
      ignore = true;
    };
  }, [fetchAll]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function save(status: "draft" | "published") {
    if (!draft) return;
    setBusy(true);
    setMsg(null);
    const body = { ...draft, status };
    delete (body as { id?: string }).id;
    delete (body as { coverImageUrl?: unknown }).coverImageUrl;
    if (draft.id) delete (body as { kind?: string }).kind;
    const res = await fetch(draft.id ? `/api/admin/content/${draft.id}` : "/api/admin/content", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Could not save" });
    setDraft({ ...j.item, excerpt: j.item.excerpt ?? "", seoTitle: j.item.seoTitle ?? "", seoDescription: j.item.seoDescription ?? "" });
    setMsg({ ok: true, text: status === "published" ? "Published." : "Saved as draft (not visible to shoppers)." });
    void reload();
  }

  async function uploadCover(file: File) {
    if (!draft?.id) return setMsg({ ok: false, text: "Save the post once before adding a cover image." });
    setBusy(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/admin/content/${draft.id}`, { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: j.error ?? "Upload failed" });
    set("coverImageUrl", j.coverImageUrl);
    setMsg({ ok: true, text: `Cover saved (1200×630).${j.notes?.length ? " " + j.notes.join(" ") : ""}` });
    void reload();
  }

  async function remove() {
    if (!draft?.id || !confirm(`Delete "${draft.title}"? This can't be undone.`)) return;
    await fetch(`/api/admin/content/${draft.id}`, { method: "DELETE" });
    setDraft(null);
    setMsg({ ok: true, text: "Deleted." });
    void reload();
  }

  const list = items.filter((i) => i.kind === tab);
  const path = draft ? (draft.kind === "page" ? `/${draft.slug || "…"}` : `/blog/${draft.slug || "…"}`) : "";

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Pages &amp; blog</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Info pages (About, Contact, Shipping, Return policy, Privacy, Terms, FAQ) and blog guides. Drafts are not
          visible to shoppers; published pages appear on the site and in Google&apos;s sitemap.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["page", "post"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => {
              setTab(k);
              setDraft(null);
            }}
            className={`rounded-full border px-4 py-1.5 text-sm ${tab === k ? "border-teal-700 bg-teal-700 text-white" : "border-zinc-300 bg-white"}`}
          >
            {k === "page" ? "Info pages" : "Blog posts"} ({items.filter((i) => i.kind === k).length})
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setDraft(blank(tab));
            setSlugTouched(false);
            setMsg(null);
          }}
          className="ml-auto rounded-lg bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-teal-800"
        >
          + New {tab === "page" ? "page" : "post"}
        </button>
      </div>

      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white text-sm">
        {list.length === 0 ? <li className="px-4 py-3 text-zinc-500">Nothing yet.</li> : null}
        {list.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => {
                setDraft({ ...i, excerpt: i.excerpt ?? "", seoTitle: i.seoTitle ?? "", seoDescription: i.seoDescription ?? "" });
                setSlugTouched(true);
                setMsg(null);
              }}
              className={`flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-zinc-50 ${draft?.id === i.id ? "bg-teal-50" : ""}`}
            >
              <span className="font-medium">{i.title}</span>
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                {i.kind === "page" ? `/${i.slug}` : `/blog/${i.slug}`}
                <span
                  className={`rounded-full px-2 py-0.5 font-medium ${i.status === "published" ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-800"}`}
                >
                  {i.status === "published" ? "Published" : "Draft"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {msg ? <p className={`text-sm ${msg.ok ? "text-teal-800" : "text-red-700"}`} role="status">{msg.text}</p> : null}

      {draft ? (
        <div className="grid gap-5 rounded-xl border border-zinc-200 bg-white p-4 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="font-medium">Title</span>
              <input
                value={draft.title}
                onChange={(e) => {
                  set("title", e.target.value);
                  if (!slugTouched && !draft.id) set("slug", slugify(e.target.value));
                }}
                className={`mt-1 ${input}`}
              />
            </label>
            <label className="block">
              <span className="font-medium">Address</span>
              <span className="mt-1 flex items-center gap-1 text-zinc-500">
                dukanwalley.com{draft.kind === "post" ? "/blog" : ""}/
                <input
                  value={draft.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", slugify(e.target.value));
                  }}
                  className={input}
                />
              </span>
            </label>
            {draft.kind === "post" ? (
              <label className="block">
                <span className="font-medium">Summary</span> <span className="text-xs text-zinc-500">(shown on the blog list)</span>
                <textarea value={draft.excerpt ?? ""} onChange={(e) => set("excerpt", e.target.value)} rows={2} maxLength={300} className={`mt-1 ${input}`} />
              </label>
            ) : null}
            <label className="block">
              <span className="font-medium">Text</span>
              <textarea
                value={draft.body}
                onChange={(e) => set("body", e.target.value)}
                rows={18}
                className={`mt-1 font-mono text-[13px] ${input}`}
                placeholder={"## A heading\n\nA paragraph of text.\n\n- A bullet point\n- **Bold words** and [a link](/products)"}
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Formatting: <code>## Heading</code> · <code>- bullet</code> · <code>**bold**</code> · <code>[link text](/products)</code> · a
                blank line between paragraphs. Text marked <code>[[fill: …]]</code> still needs your details.
              </span>
            </label>
            <details className="rounded-lg border border-zinc-200 p-3">
              <summary className="font-medium">Search engine settings (optional)</summary>
              <label className="mt-2 block">
                <span className="text-xs text-zinc-600">Title in Google (up to 70 characters; defaults to the title)</span>
                <input value={draft.seoTitle ?? ""} onChange={(e) => set("seoTitle", e.target.value)} maxLength={70} className={`mt-1 ${input}`} />
              </label>
              <label className="mt-2 block">
                <span className="text-xs text-zinc-600">Description in Google (up to 170 characters)</span>
                <textarea value={draft.seoDescription ?? ""} onChange={(e) => set("seoDescription", e.target.value)} maxLength={170} rows={2} className={`mt-1 ${input}`} />
              </label>
            </details>
            {draft.kind === "page" ? (
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={draft.showInFooter} onChange={(e) => set("showInFooter", e.target.checked)} />
                  Link in footer
                </label>
                <label className="flex items-center gap-2">
                  Order
                  <input
                    type="number"
                    value={draft.footerOrder}
                    onChange={(e) => set("footerOrder", Number(e.target.value) || 0)}
                    className="w-20 rounded-lg border px-2 py-1"
                  />
                </label>
              </div>
            ) : (
              <label className="block">
                <span className="font-medium">Cover image</span> <span className="text-xs text-zinc-500">(1200×630 works best; also used when shared)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void uploadCover(f);
                  }}
                  className="mt-1 block"
                />
                {draft.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin preview of the stored file
                  <img src={draft.coverImageUrl} alt="" className="mt-2 aspect-[1200/630] w-full max-w-sm object-cover" />
                ) : null}
              </label>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
              <button type="button" disabled={busy} onClick={() => void save("draft")} className="rounded-lg border px-4 py-2 font-medium">
                Save draft
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (/\[\[fill:/i.test(draft.body) && !confirm("This text still has [[fill: …]] placeholders. Publish anyway?")) return;
                  void save("published");
                }}
                className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800"
              >
                {draft.status === "published" ? "Update (published)" : "Publish"}
              </button>
              {draft.status === "published" && draft.id ? (
                <button type="button" disabled={busy} onClick={() => void save("draft")} className="text-sm text-amber-800 hover:underline">
                  Unpublish
                </button>
              ) : null}
              {draft.id && draft.status === "published" ? (
                <a href={path} target="_blank" rel="noopener" className="text-sm font-medium text-teal-700 hover:underline">
                  View on site ↗
                </a>
              ) : null}
              {draft.id ? (
                <button type="button" onClick={() => void remove()} className="ml-auto text-sm text-red-700 hover:underline">
                  Delete
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Preview · {path}</p>
            <div className="mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-zinc-200 p-4">
              <h1 className="text-2xl font-semibold text-zinc-900">{draft.title || "Title"}</h1>
              <Markdown>{draft.body || "_Start typing to see the preview._"}</Markdown>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
