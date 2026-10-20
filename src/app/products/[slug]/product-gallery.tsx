"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useProductSelection } from "./product-selection";

/** `color`: the colour a photo shows (null = any), so picking a colour can jump to it. */
export type GalleryMedia = { type: "image" | "video"; url: string; color?: string | null };

/** YouTube / Vimeo links play in an iframe; uploaded files and other URLs in <video>. */
function embedUrl(url: string) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { src: `https://www.youtube.com/embed/${yt[1]}?rel=0`, poster: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg` };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { src: `https://player.vimeo.com/video/${vimeo[1]}`, poster: null };
  return null;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayBadge({ small = false }: { small?: boolean }) {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className={`flex items-center justify-center rounded-full bg-black/60 text-white ${small ? "h-7 w-7" : "h-14 w-14"}`}>
        <svg viewBox="0 0 24 24" className={small ? "h-3.5 w-3.5" : "h-7 w-7"} fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </span>
  );
}

function VideoSlide({ url, active }: { url: string; active: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const embed = embedUrl(url);
  // Stop playback when the shopper moves to another slide.
  useEffect(() => {
    if (!active) ref.current?.pause();
  }, [active]);
  if (embed) {
    // An iframe can't be paused from outside, so only mount it on the active slide.
    return active ? (
      <iframe
        src={embed.src}
        title="Product video"
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    ) : null;
  }
  return <video ref={ref} src={url} controls playsInline preload="metadata" className="h-full w-full bg-black object-contain" />;
}

function Thumb({ item, name }: { item: GalleryMedia; name: string }) {
  if (item.type === "image") {
    return <Image src={item.url} alt={name} fill unoptimized className="object-cover" sizes="80px" />;
  }
  const embed = embedUrl(item.url);
  return (
    <>
      {embed?.poster ? (
        <Image src={embed.poster} alt="" fill unoptimized className="object-cover" sizes="80px" />
      ) : embed ? (
        <span className="absolute inset-0 bg-zinc-800" />
      ) : (
        <video src={`${item.url}#t=0.5`} muted preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <PlayBadge small />
    </>
  );
}

/** Vertical strip (left of the main image) on wide screens, horizontal row on phones. Hovering a thumbnail shows it. */
function Thumbnails({
  media,
  name,
  index,
  onSelect,
  dark = false,
}: {
  media: GalleryMedia[];
  name: string;
  index: number;
  onSelect: (i: number) => void;
  dark?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // Keep the active thumbnail visible without scrolling the page itself.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.children[index] as HTMLElement | undefined;
    if (!list || !el) return;
    const vertical = list.scrollHeight > list.clientHeight;
    if (vertical) {
      if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
      else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
    } else if (el.offsetLeft < list.scrollLeft || el.offsetLeft + el.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2;
    }
  }, [index]);

  return (
    <div
      ref={listRef}
      className="relative flex gap-2 overflow-x-auto sm:absolute sm:inset-0 sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto"
    >
      {media.map((item, i) => (
        <button
          key={`${item.url}-${i}`}
          type="button"
          onMouseEnter={() => onSelect(i)}
          onFocus={() => onSelect(i)}
          onClick={() => onSelect(i)}
          aria-label={`Show ${item.type} ${i + 1} of ${media.length}`}
          aria-current={i === index}
          className={`relative aspect-square w-16 shrink-0 overflow-hidden rounded-md border-2 sm:w-full ${
            i === index ? (dark ? "border-white" : "border-zinc-900") : "border-transparent opacity-80 hover:opacity-100"
          } ${dark ? "bg-zinc-800" : "bg-zinc-100"}`}
        >
          <Thumb item={item} name={name} />
        </button>
      ))}
    </div>
  );
}

function ArrowButton({ dir, onClick, dark = false }: { dir: "left" | "right"; onClick: () => void; dark?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={dir === "left" ? "Previous" : "Next"}
      className={`absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full shadow-md transition hover:scale-105 ${
        dir === "left" ? "left-3" : "right-3"
      } ${dark ? "bg-white/15 text-white hover:bg-white/25" : "bg-white/90 text-zinc-900 hover:bg-white"}`}
    >
      <Chevron dir={dir} />
    </button>
  );
}

/** Full-screen view. Click the image to magnify; move the mouse to pan. */
function ZoomView({
  media,
  name,
  index,
  setIndex,
  step,
  onClose,
}: {
  media: GalleryMedia[];
  name: string;
  index: number;
  setIndex: (i: number) => void;
  step: (d: number) => void;
  onClose: () => void;
}) {
  const [magnified, setMagnified] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const item = media[index];

  // Leaving an image drops the magnification.
  const [lastIndex, setLastIndex] = useState(index);
  if (index !== lastIndex) {
    setLastIndex(index);
    setMagnified(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, step]);

  const pan = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${name} — zoom view`} className="fixed inset-0 z-50 flex bg-zinc-950/95">
      <div className="relative flex min-w-0 flex-1 items-center justify-center p-4 sm:p-8">
        {media.length > 1 ? <ArrowButton dir="left" dark onClick={() => step(-1)} /> : null}
        {item.type === "image" ? (
          <div
            className={`relative h-full w-full overflow-hidden ${magnified ? "cursor-zoom-out" : "cursor-zoom-in"}`}
            onClick={(e) => {
              pan(e);
              setMagnified((m) => !m);
            }}
            onMouseMove={magnified ? pan : undefined}
          >
            <Image
              src={item.url}
              alt={name}
              fill
              unoptimized
              sizes="100vw"
              className="object-contain transition-transform duration-200"
              style={{ transform: magnified ? "scale(2.5)" : "none", transformOrigin: origin }}
            />
          </div>
        ) : (
          <div className="aspect-video w-full max-w-5xl">
            <VideoSlide url={item.url} active />
          </div>
        )}
        {media.length > 1 ? <ArrowButton dir="right" dark onClick={() => step(1)} /> : null}
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
          {index + 1} / {media.length}
          {item.type === "image" ? ` · ${magnified ? "Click to zoom out" : "Click to zoom in"}` : ""}
        </p>
      </div>
      <div className="order-first hidden w-24 shrink-0 py-16 pl-4 sm:block">
        <div className="relative h-full">
          <Thumbnails media={media} name={name} index={index} onSelect={setIndex} dark />
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close zoom view"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-2xl leading-none text-white hover:bg-white/25"
      >
        ×
      </button>
    </div>,
    document.body,
  );
}

export function ProductGallery({ media, name }: { media: GalleryMedia[]; name: string }) {
  const [index, setIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = media.length;

  // Picking a colour in the option picker shows that colour's first photo.
  const { color } = useProductSelection();
  const [lastColor, setLastColor] = useState(color);
  if (color !== lastColor) {
    setLastColor(color);
    const first = color ? media.findIndex((m) => m.color === color) : -1;
    if (first >= 0) setIndex(first);
  }

  const step = useCallback((d: number) => setIndex((i) => (i + d + count) % count), [count]);
  const closeZoom = useCallback(() => setZoomOpen(false), []);

  if (count === 0) {
    return <div className="aspect-square rounded-xl bg-zinc-100" />;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[5rem_1fr]">
      <div
        className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100 sm:order-2"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        <div
          className="flex h-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {media.map((item, i) => (
            <div key={`${item.url}-${i}`} className="relative h-full w-full shrink-0" aria-hidden={i !== index}>
              {item.type === "image" ? (
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  tabIndex={i === index ? 0 : -1}
                  aria-label="Open zoom view"
                  className="relative block h-full w-full cursor-zoom-in"
                >
                  <Image
                    src={item.url}
                    alt={name}
                    fill
                    unoptimized
                    preload={i === 0}
                    className="object-cover"
                    sizes="(max-width:1024px) 100vw, 50vw"
                  />
                </button>
              ) : (
                <VideoSlide url={item.url} active={i === index} />
              )}
            </div>
          ))}
        </div>
        {count > 1 ? (
          <>
            <ArrowButton dir="left" onClick={() => step(-1)} />
            <ArrowButton dir="right" onClick={() => step(1)} />
            <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2.5 py-0.5 text-xs text-white">
              {index + 1} / {count}
            </span>
          </>
        ) : null}
      </div>
      {/* Left of the main image on wide screens, below it on phones. Shown even for one item. */}
      <div className="relative sm:order-1">
        <Thumbnails media={media} name={name} index={index} onSelect={setIndex} />
      </div>
      {zoomOpen ? (
        <ZoomView media={media} name={name} index={index} setIndex={setIndex} step={step} onClose={closeZoom} />
      ) : null}
    </div>
  );
}
