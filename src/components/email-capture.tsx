"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

/** Pages where the box never shows: buying, accounts and staff areas. */
const QUIET_PATHS = /^\/(checkout|cart|admin|vendor|sales|auth|account|orders|unsubscribe)(\/|$)/;
const KEY = "dw_email_capture";
const SNOOZE_DAYS = 14;
const SHOW_AFTER_MS = 25_000;
/** Desktop: when the pointer leaves through the top of the window, after this long on the site. */
const EXIT_INTENT_AFTER_MS = 8_000;

function readState(): { subscribed?: boolean; dismissedAt?: number } {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeState(s: { subscribed?: boolean; dismissedAt?: number }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

/** Remembers that this browser subscribed (also used by the footer form). */
export function markSubscribed() {
  writeState({ subscribed: true });
}

/**
 * A small, dismissible corner box inviting shoppers to join the newsletter. Shown at most once
 * per visit, never again for 14 days after "No thanks", never to signed-in customers, and never
 * while shopping the cart or checkout.
 */
export function EmailCapture({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const quiet = !enabled || status !== "unauthenticated" || QUIET_PATHS.test(pathname ?? "/");

  useEffect(() => {
    if (quiet || open) return;
    const s = readState();
    if (s.subscribed || (s.dismissedAt && Date.now() - s.dismissedAt < SNOOZE_DAYS * 86_400_000)) return;
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {}

    const started = Date.now();
    const show = () => {
      try {
        sessionStorage.setItem(KEY, "shown");
      } catch {}
      setOpen(true);
    };
    const timer = window.setTimeout(show, SHOW_AFTER_MS);
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget && Date.now() - started > EXIT_INTENT_AFTER_MS) show();
    };
    document.addEventListener("mouseout", onLeave);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [quiet, open]);

  // Navigating to checkout etc. hides it.
  if (!open || quiet) return null;

  function dismiss() {
    writeState({ dismissedAt: Date.now() });
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
      window.setTimeout(() => setOpen(false), 5000);
    } else {
      setState("error");
    }
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
          onClick={dismiss}
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
              <form onSubmit={submit} className="mt-3 flex gap-2">
                <label htmlFor="capture-email" className="sr-only">
                  Email
                </label>
                <input
                  id="capture-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="Your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
                <button disabled={state === "busy"} className="rounded-lg bg-[#f47b20] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Join
                </button>
              </form>
              {state === "error" ? <p className="mt-2 text-xs text-red-600">Please check your email and try again.</p> : null}
              <button type="button" onClick={dismiss} className="mt-2 text-xs text-zinc-500 underline-offset-2 hover:underline">
                No thanks
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
