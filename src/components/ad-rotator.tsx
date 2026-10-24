"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";
import { Rotator } from "@/components/rotator";
import { canOptimizeImage } from "@/lib/media-url";

export type AdSlide = { id: string; imageUrl: string; alt: string; hasLink: boolean };

/**
 * Paid banners for one section, rotating when several companies booked it. A view is counted once
 * per banner per page view, and only after it has been on screen (at least half visible).
 */
export function AdRotator({ ads, sizes, label }: { ads: AdSlide[]; sizes: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const visible = useRef(false);
  const shown = useRef<number>(0);
  const counted = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    timer.current = null;
    const ids = [...pending.current];
    pending.current.clear();
    if (!ids.length) return;
    const body = JSON.stringify({ ids });
    if (!navigator.sendBeacon?.("/api/ads/views", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/ads/views", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    }
  }, []);

  const countCurrent = useCallback(() => {
    const ad = ads[shown.current];
    if (!ad || !visible.current || counted.current.has(ad.id)) return;
    counted.current.add(ad.id);
    pending.current.add(ad.id);
    timer.current ??= setTimeout(flush, 1500);
  }, [ads, flush]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting;
        countCurrent();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    const leave = () => flush();
    window.addEventListener("pagehide", leave);
    return () => {
      io.disconnect();
      window.removeEventListener("pagehide", leave);
      flush();
    };
  }, [countCurrent, flush]);

  const onShow = useCallback(
    (i: number) => {
      shown.current = i;
      countCurrent();
    },
    [countCurrent],
  );

  return (
    <div ref={box} className="absolute inset-0">
      <Rotator
        label={label}
        onShow={onShow}
        randomStart
        slides={ads.map((ad) => {
          const img = (
            <Image
              src={ad.imageUrl}
              alt={ad.alt}
              fill
              sizes={sizes}
              unoptimized={!canOptimizeImage(ad.imageUrl)}
              className="object-cover"
            />
          );
          return (
            <>
              {ad.hasLink ? (
                // Clicks are counted, then forwarded to the advertiser's link; paid links are "sponsored".
                <a href={`/api/ads/${ad.id}/click`} target="_blank" rel="sponsored noopener" className="absolute inset-0">
                  {img}
                </a>
              ) : (
                img
              )}
              <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Ad
              </span>
            </>
          );
        })}
      />
    </div>
  );
}
