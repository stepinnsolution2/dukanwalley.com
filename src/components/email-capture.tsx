"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

/** Pages where it never shows: buying, accounts and staff areas. */
const QUIET_PATHS = /^\/(checkout|cart|admin|vendor|sales|auth|account|orders|unsubscribe)(\/|$)/;
const KEY = "dw_email_capture";
/** Shown once the visitor has been idle this long (they've stopped to look around)… */
const IDLE_MS = 6_000;
/** …but not in the first moments on the site, and at the latest after this long. */
const MIN_MS = 5_000;
const MAX_MS = 40_000;

type Offer = { amount: number; headline: string; text: string };

function readState(): { subscribed?: boolean; dismissed?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeState(s: { subscribed?: boolean; dismissed?: boolean }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

/** Remembers that this browser subscribed (also used by the footer form). */
export function markSubscribed() {
  writeState({ subscribed: true });
}

/**
 * Invites first-time visitors to join the mailing list: a large pop-up announcing the free-gift
 * offer when one is set (Admin › Settings › Email marketing), else a small corner box. It waits
 * until the visitor pauses, shows once, and never comes back after it is closed or answered.
 * Never shown to signed-in customers or while shopping the cart or checkout.
 */
export function EmailCapture({ enabled, offer }: { enabled: boolean; offer: Offer | null }) {
  const pathname = usePathname();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  const quiet = !enabled || status !== "unauthenticated" || QUIET_PATHS.test(pathname ?? "/");

  useEffect(() => {
    if (quiet || open) return;
    const s = readState();
    if (s.subscribed || s.dismissed) return;

    const started = Date.now();
    let idleTimer = 0;
    const show = () => setOpen(true);
    const resetIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(show, Math.max(IDLE_MS, MIN_MS - (Date.now() - started)));
    };
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget && Date.now() - started > MIN_MS) show();
    };
    const events = ["mousemove", "scroll", "keydown", "touchstart", "click"] as const;
    for (const ev of events) window.addEventListener(ev, resetIdle, { passive: true });
    document.addEventListener("mouseout", onLeave);
    resetIdle();
    const maxTimer = window.setTimeout(show, MAX_MS);
    return () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(maxTimer);
      for (const ev of events) window.removeEventListener(ev, resetIdle);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [quiet, open]);

  useEffect(() => {
    if (!open || !offer) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, offer]);

  if (!open || quiet) return null;

  function close() {
    if (!readState().subscribed) writeState({ dismissed: true });
    setOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const res = await fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "popup" }),
    }).catch(() => null);
    if (res?.ok) {
      markSubscribed();
      setState("done");
      if (!offer) window.setTimeout(() => setOpen(false), 5000);
    } else {
      setState("error");
    }
  }

  const form = (big: boolean) => (
    <form onSubmit={submit} className={big ? "mt-5 space-y-2" : "mt-3 flex gap-2"}>
      <label htmlFor="capture-email" className="sr-only">
        Email
      </label>
      <input
        ref={inputRef}
        id="capture-email"
        type="email"
        required
        autoComplete="email"
        placeholder={big ? "Enter your email address" : "Your email"}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={`min-w-0 rounded-lg border border-zinc-300 px-3 text-sm ${big ? "w-full py-3 text-center" : "flex-1 py-2"}`}
      />
      <button
        disabled={state === "busy"}
        className={`rounded-lg bg-[#f47b20] text-sm font-semibold text-white hover:bg-[#e06a12] disabled:opacity-50 ${big ? "w-full py-3 uppercase tracking-wide" : "px-4 py-2"}`}
      >
        {big ? "Subscribe" : "Join"}
      </button>
      {state === "error" ? <p className="text-xs text-red-600">Please check your email and try again.</p> : null}
    </form>
  );

  if (offer) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 motion-safe:animate-[fadein_.25s_ease-out]" onClick={close}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Free gift offer"
          onClick={(e) => e.stopPropagation()}
          className="relative grid w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl sm:grid-cols-2 motion-safe:animate-[slideup_.35s_ease-out]"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-zinc-600 shadow hover:text-zinc-900"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden>
              <path d="M5.3 4.3a1 1 0 0 1 1.4 0L10 7.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 9l3.3 3.3a1 1 0 0 1-1.4 1.4L10 10.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 9 5.3 5.7a1 1 0 0 1 0-1.4Z" />
            </svg>
          </button>
          <div className="flex flex-col items-center justify-center bg-[#16325c] px-6 py-8 text-center sm:py-12">
            <span className="text-5xl sm:text-6xl" aria-hidden>
              🎁
            </span>
            <p className="mt-3 text-3xl font-black uppercase leading-tight tracking-tight text-[#ffc94d] sm:text-5xl">Free gift</p>
            <p className="mt-2 text-lg font-extrabold uppercase leading-snug text-white sm:text-2xl">
              on orders above
              <span className="block text-[#ffc94d]">Rs {offer.amount.toLocaleString("en-PK")}</span>
            </p>
            <p className="mt-6 hidden text-xs font-semibold tracking-[0.25em] text-white/70 sm:block">DUKANWALLEY.COM</p>
          </div>
          <div className="flex flex-col justify-center px-6 py-7 text-center sm:px-8">
            {state === "done" ? (
              <>
                <p className="text-2xl font-bold text-[#16325c]">You&apos;re in! 🎉</p>
                <p className="mt-2 text-sm text-zinc-600">
                  Thanks for joining. Shop for Rs {offer.amount.toLocaleString("en-PK")} or more and your free gift comes in the same parcel.
                </p>
                <button type="button" onClick={() => setOpen(false)} className="mt-5 rounded-lg bg-[#16325c] py-3 text-sm font-semibold uppercase tracking-wide text-white">
                  Start shopping
                </button>
              </>
            ) : (
              <>
                <Image src="/email-logo.png" alt="DukanWalley" width={199} height={40} className="mx-auto h-8 w-auto" />
                <p className="mt-4 text-xl font-extrabold uppercase tracking-wide text-zinc-900">{offer.headline}</p>
                <p className="mt-2 text-sm text-zinc-600">{offer.text}</p>
                {form(true)}
                <button type="button" onClick={close} className="mt-4 text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800">
                  No, thanks
                </button>
                <p className="mt-3 text-[11px] text-zinc-400">No spam. Unsubscribe any time.</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Join for deals"
      className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:bottom-5 sm:left-5 sm:w-[22rem] motion-safe:animate-[slideup_.35s_ease-out]"
    >
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="h-1 bg-gradient-to-r from-[#16325c] via-[#f47b20] to-[#16325c]" />
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-2 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M5.3 4.3a1 1 0 0 1 1.4 0L10 7.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 9l3.3 3.3a1 1 0 0 1-1.4 1.4L10 10.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 9 5.3 5.7a1 1 0 0 1 0-1.4Z" />
          </svg>
        </button>
        <div className="p-5">
          {state === "done" ? (
            <div className="py-2 text-center">
              <p className="text-lg font-semibold text-[#16325c]">You&apos;re in! 🎉</p>
              <p className="mt-1 text-sm text-zinc-600">Watch your inbox for our next deals and new arrivals.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 pr-6">
                <Image src="/logo-mark.png" alt="" width={40} height={32} className="h-8 w-auto" />
                <p className="text-base font-semibold leading-snug text-[#16325c]">Get deals before everyone else</p>
              </div>
              <p className="mt-2 text-sm text-zinc-600">
                Festive sales, new arrivals and offers from our sellers, straight to your inbox. No spam, unsubscribe any time.
              </p>
              {form(false)}
              <button type="button" onClick={close} className="mt-2 text-xs text-zinc-500 underline-offset-2 hover:underline">
                No thanks
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
