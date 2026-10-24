"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cross-fading slideshow filling its parent (which sets the size). Autoplays unless the visitor
 * prefers reduced motion; pauses on hover/focus and while the tab is hidden.
 */
export function Rotator({
  slides,
  intervalMs = 6000,
  label,
  onShow,
  randomStart = false,
}: {
  slides: React.ReactNode[];
  intervalMs?: number;
  label: string;
  /** Called with the visible slide's index whenever it changes (and initially). */
  onShow?: (index: number) => void;
  /** Start on a random slide so rotating ads share first impressions fairly. */
  randomStart?: boolean;
}) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const started = useRef(false);

  // Random start after mount (the server render always shows the first slide).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (randomStart && count > 1) setIndex(Math.floor(Math.random() * count)); // eslint-disable-line react-hooks/set-state-in-effect -- one-time client-only choice
  }, [randomStart, count]);

  useEffect(() => {
    onShow?.(index);
  }, [index, onShow]);

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => clearInterval(t);
  }, [count, paused, intervalMs]);

  if (!count) return null;
  return (
    <div
      className="group/rot absolute inset-0"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
    >
      {slides.map((slide, i) => (
        <div
          key={i}
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}`}
          aria-hidden={i !== index}
          inert={i !== index}
          className={`absolute inset-0 transition-opacity duration-700 ${i === index ? "opacity-100" : "opacity-0"}`}
        >
          {slide}
        </div>
      ))}
      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => go(index - 1)}
            className="absolute left-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-white/80 px-2.5 py-1 text-lg text-zinc-800 opacity-0 shadow transition group-hover/rot:opacity-100 focus:opacity-100 sm:block"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => go(index + 1)}
            className="absolute right-2 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-white/80 px-2.5 py-1 text-lg text-zinc-800 opacity-0 shadow transition group-hover/rot:opacity-100 focus:opacity-100 sm:block"
          >
            ›
          </button>
          <div className="absolute bottom-2.5 right-3 z-20 flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Show slide ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/60 hover:bg-white/90"}`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
