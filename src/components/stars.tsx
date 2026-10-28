/** Five stars filled to `rating` (0–5, fractions allowed). */
export function Stars({ rating, className = "h-4 w-4" }: { rating: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100));
  const row = (fill: string) => (
    <span className="flex">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 20 20" className={`${className} shrink-0 ${fill}`} aria-hidden>
          <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L10 15l-5.4 3 1.2-6L1.3 7.8l6.1-.7z" fill="currentColor" />
        </svg>
      ))}
    </span>
  );
  return (
    <span className="relative inline-flex" role="img" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {row("text-zinc-300")}
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
        {row("text-amber-500")}
      </span>
    </span>
  );
}

/** Stars, average and count for product cards; nothing when there are no reviews. */
export function RatingBadge({ avg, count }: { avg: number; count: number }) {
  if (!count) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600">
      <Stars rating={avg} className="h-3 w-3" />
      {avg.toFixed(1)} ({count})
    </span>
  );
}
