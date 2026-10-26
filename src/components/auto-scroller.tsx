"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * A single-line row that slowly scrolls itself from right to left, looping forever. Shoppers can
 * still swipe or scroll it; it pauses while hovered, touched or focused, while off screen or in a
 * background tab, and never moves for visitors who prefer reduced motion. When the items fit on
 * screen it stays still.
 *
 * The items are rendered twice so the end joins the start; the copy is hidden from screen readers
 * and the keyboard.
 */
export function AutoScroller({
  children,
  label,
  speed = 28,
  className = "",
}: {
  children: React.ReactNode;
  label: string;
  /** Pixels per second. */
  speed?: number;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const firstCopy = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const paused = useRef(false);
  const visible = useRef(true);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only loop (and duplicate the items) when they are wider than the row.
  useLayoutEffect(() => {
    const el = scroller.current;
    const first = firstCopy.current;
    if (!el || !first) return;
    const check = () => setOverflows(first.scrollWidth > el.clientWidth + 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    ro.observe(first);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = scroller.current;
    const first = firstCopy.current;
    if (!el || !first || !overflows) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    io.observe(el);

    let raf = 0;
    let last = performance.now();
    let carry = 0; // sub-pixel progress, since scrollLeft rounds to whole pixels
    const step = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (!paused.current && visible.current && document.visibilityState === "visible") {
        carry += (speed * dt) / 1000;
        const whole = Math.floor(carry);
        if (whole > 0) {
          carry -= whole;
          // One full copy wide = back to where the second copy started: jump back seamlessly.
          const loop = first.offsetWidth;
          el.scrollLeft = el.scrollLeft + whole >= loop ? el.scrollLeft + whole - loop : el.scrollLeft + whole;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [overflows, speed]);

  const pause = () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    paused.current = true;
  };
  // After a touch or scroll, wait a moment before moving again.
  const resumeSoon = (ms = 2500) => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => (paused.current = false), ms);
  };
  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  return (
    <div
      ref={scroller}
      role="region"
      aria-label={label}
      className={`flex overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      onMouseEnter={pause}
      onMouseLeave={() => resumeSoon(400)}
      onTouchStart={pause}
      onTouchEnd={() => resumeSoon()}
      onFocusCapture={pause}
      onBlurCapture={() => resumeSoon(400)}
      onWheel={() => {
        pause();
        resumeSoon();
      }}
    >
      <div ref={firstCopy} className="flex shrink-0 gap-3 pr-3">
        {children}
      </div>
      {overflows ? (
        <div aria-hidden inert className="flex shrink-0 gap-3 pr-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
