"use client";

import Image from "next/image";
import { useRef, useState } from "react";

type Kind = "image" | "video";

const ACCEPT: Record<Kind, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif",
  video: "video/mp4,video/webm,video/quicktime",
};
const MAX_MB: Record<Kind, number> = { image: 10, video: 200 };

type Pending = { id: number; name: string; progress: number; error?: string };

/** Upload one file to /api/uploads with progress (fetch has no upload progress, XHR does). */
function uploadFile(kind: Kind, file: File, onProgress: (p: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads?kind=${kind}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { url?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status === 200 && body.url) resolve(body.url);
      else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
}

export function MediaUploader({
  kind,
  value,
  onChange,
  max,
  tagOptions,
  tags,
  onTag,
}: {
  kind: Kind;
  value: string[];
  /** Same shape as a React state setter, so concurrent uploads append instead of overwriting. */
  onChange: (update: string[] | ((prev: string[]) => string[])) => void;
  max: number;
  /** Optional per-file tag (e.g. which colour a photo shows). Shown when there are options. */
  tagOptions?: string[];
  tags?: Record<string, string>;
  onTag?: (url: string, tag: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);

  async function addFiles(files: FileList | File[]) {
    const room = max - value.length - pending.filter((p) => !p.error).length;
    const list = [...files].slice(0, Math.max(0, room));
    await Promise.all(
      list.map(async (file) => {
        const id = Math.random();
        const tooBig = file.size > MAX_MB[kind] * 1024 * 1024;
        setPending((p) => [...p, { id, name: file.name, progress: 0, error: tooBig ? `Over ${MAX_MB[kind]} MB` : undefined }]);
        if (tooBig) return;
        try {
          const url = await uploadFile(kind, file, (progress) =>
            setPending((p) => p.map((x) => (x.id === id ? { ...x, progress } : x))),
          );
          onChange((prev) => [...prev, url]);
          setPending((p) => p.filter((x) => x.id !== id));
        } catch (e) {
          setPending((p) => p.map((x) => (x.id === id ? { ...x, error: (e as Error).message } : x)));
        }
      }),
    );
  }

  function move(i: number, delta: number) {
    const next = [...value];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  const full = value.length >= max;
  return (
    <div
      className={`rounded-lg border border-dashed p-3 ${dragging ? "border-teal-600 bg-teal-50" : "border-zinc-300"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {value.map((url, i) => (
          <li key={url} className="relative overflow-hidden rounded-md border border-zinc-200 bg-zinc-50">
            <div className="relative aspect-square">
              {kind === "image" ? (
                <Image src={url} alt="" fill unoptimized className="object-cover" sizes="160px" />
              ) : (
                <video src={url} muted preload="metadata" className="h-full w-full object-cover" />
              )}
            </div>
            {kind === "image" ? (
              i === 0 ? (
                <span className="absolute left-1 top-1 rounded bg-teal-700 px-1.5 text-[10px] font-semibold text-white">Main</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onChange([url, ...value.filter((u) => u !== url)])}
                  className="absolute left-1 top-1 rounded bg-white/90 px-1.5 text-[10px] font-semibold text-teal-800 shadow hover:bg-teal-700 hover:text-white"
                >
                  Make main
                </button>
              )
            ) : null}
            {tagOptions?.length && onTag ? (
              <select
                className="w-full border-t border-zinc-200 bg-white px-1 py-0.5 text-xs"
                value={tagOptions.includes(tags?.[url] ?? "") ? tags![url] : ""}
                onChange={(e) => onTag(url, e.target.value)}
                aria-label="Colour shown in this photo"
              >
                <option value="">All colours</option>
                {tagOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex justify-between bg-white/90 px-1 py-0.5 text-xs">
              <span className="flex gap-1">
                <button type="button" aria-label="Move left" onClick={() => move(i, -1)} className="px-1 hover:text-teal-700">←</button>
                <button type="button" aria-label="Move right" onClick={() => move(i, 1)} className="px-1 hover:text-teal-700">→</button>
              </span>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => onChange(value.filter((u) => u !== url))}
                className="px-1 text-red-600 hover:text-red-800"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.id} className="flex aspect-square flex-col justify-center gap-1 rounded-md border border-zinc-200 p-2 text-xs">
            <span className="truncate">{p.name}</span>
            {p.error ? (
              <>
                <span className="text-red-600">{p.error}</span>
                <button type="button" onClick={() => setPending((x) => x.filter((y) => y.id !== p.id))} className="text-left underline">
                  Dismiss
                </button>
              </>
            ) : (
              <span className="h-1.5 w-full rounded bg-zinc-200">
                <span className="block h-1.5 rounded bg-teal-600" style={{ width: `${Math.round(p.progress * 100)}%` }} />
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <button
          type="button"
          disabled={full}
          onClick={() => input.current?.click()}
          className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          {kind === "image" ? "Add images" : "Add videos"}
        </button>
        <span>
          {value.length}/{max} · drag &amp; drop or choose ·{" "}
          {kind === "image" ? "JPEG/PNG/WebP/GIF up to 10 MB" : "MP4/MOV/WebM up to 200 MB"}
        </span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT[kind]}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
