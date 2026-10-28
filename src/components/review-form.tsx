"use client";

import { useState } from "react";

export type ExistingReview = { rating: number; title: string | null; body: string; authorName: string; status: string } | null;

/** Review box for one delivered order line (signed-in buyers, or guests with Track order proof). */
export function ReviewForm({
  orderItemId,
  productName,
  existing,
  defaultName,
  proof,
}: {
  orderItemId: string;
  productName: string;
  existing: ExistingReview;
  defaultName?: string;
  proof?: { orderNumber: string; contact: string };
}) {
  const [review, setReview] = useState(existing);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [name, setName] = useState(defaultName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setError("Choose a star rating");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderItemId, rating, title: title || undefined, body, name: name || undefined, ...proof }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Could not save your review");
    setReview(j.review);
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="mt-1 text-xs">
        {review ? (
          <span className="text-zinc-600">
            Your review: <span className="text-amber-500">{"★".repeat(review.rating)}</span>
            <span className="text-zinc-300">{"★".repeat(5 - review.rating)}</span>
            {review.status === "hidden" ? " (hidden by our team)" : ""} ·{" "}
          </span>
        ) : null}
        <button type="button" onClick={() => setOpen(true)} className="font-medium text-teal-700 hover:underline">
          {review ? "Edit your review" : "★ Write a review"}
        </button>
      </div>
    );
  }

  const shown = hover || rating;
  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
      <p className="font-medium">How was {productName}?</p>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            className={`text-2xl leading-none ${n <= shown ? "text-amber-500" : "text-zinc-300"}`}
          >
            ★
          </button>
        ))}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Title (optional), e.g. Great quality" className="w-full rounded border bg-white px-3 py-2" />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={4}
        required
        placeholder="What did you like or dislike? How were the size, quality and delivery?"
        className="w-full rounded border bg-white px-3 py-2"
      />
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Your name (shown as first name and initial)" className="w-full rounded border bg-white px-3 py-2" />
      {error ? <p className="text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button disabled={busy} className="rounded bg-teal-700 px-3 py-1.5 font-semibold text-white disabled:opacity-50">
          {busy ? "Saving…" : review ? "Update review" : "Post review"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded border bg-white px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}
