"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-context";
import { formatMoney, type MarketCode } from "@/lib/markets";
import { canOptimizeImage } from "@/lib/media-url";

type Suggestion = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number;
  priceVaries: boolean;
  addable: boolean;
  variantId: string | null;
  reason: string;
  reasonLabel: string;
};

const PLACEMENT = "cart";

function logEvent(kind: "SHOWN" | "CLICK" | "ADD", items: Pick<Suggestion, "id" | "reason">[]) {
  if (!items.length) return;
  void fetch("/api/recommendations/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, placement: PLACEMENT, items: items.map((i) => ({ productId: i.id, reason: i.reason })) }),
    keepalive: true, // a click navigates away; let the request finish
  }).catch(() => {});
}

/**
 * "You may also like" row under the cart. Reloads whenever the cart's lines change.
 * `active` is false while the cart panel is closed, so hidden suggestions aren't fetched or logged.
 */
export function CartSuggestions({ active }: { active: boolean }) {
  const { cart, reload } = useCart();
  const [data, setData] = useState<{ market: MarketCode; items: Suggestion[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastShown = useRef("");

  // Product + quantity of every line: a change means the suggestions may change.
  const cartKey = cart ? cart.items.map((i) => `${i.product.id}:${i.quantity}`).join(",") : null;

  useEffect(() => {
    if (!active || cartKey === null) return;
    let ignore = false;
    void fetch("/api/recommendations")
      .then((r) => r.json())
      .then((j) => {
        if (ignore) return;
        const items: Suggestion[] = j.items ?? [];
        setData({ market: j.market, items });
        const shownKey = items.map((i) => i.id).join(",");
        if (shownKey !== lastShown.current) {
          lastShown.current = shownKey;
          logEvent("SHOWN", items);
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [active, cartKey]);

  async function add(s: Suggestion) {
    setBusy(s.id);
    setError(null);
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: s.id, quantity: 1, ...(s.variantId ? { variantId: s.variantId } : {}) }),
    });
    if (res.ok) {
      logEvent("ADD", [s]);
      await reload();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Could not add to cart");
    }
    setBusy(null);
  }

  if (!active || !data?.items.length) return null;
  const empty = !cart?.items.length;

  return (
    <section className="mt-6 lg:mt-4 lg:w-[45%] lg:shrink-0" aria-label="Suggestions">
      <h3 className="text-base font-semibold text-zinc-900">{empty ? "Picked for you" : "You may also like"}</h3>
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
      <ul className="mt-3 flex gap-2 overflow-x-auto pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible xl:grid-cols-4">
        {data.items.map((s) => (
          <li key={s.id} className="flex w-32 shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white lg:w-auto">
            <Link href={`/products/${s.slug}`} onClick={() => logEvent("CLICK", [s])} className="group block">
              <div className="relative aspect-square bg-zinc-100">
                {s.imageUrl ? (
                  <Image src={s.imageUrl} alt={s.name} fill unoptimized={!canOptimizeImage(s.imageUrl)} className="object-cover transition group-hover:scale-[1.03]" sizes="(max-width:1024px) 128px, 160px" />
                ) : null}
              </div>
              <div className="px-2 pt-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-teal-700">{s.reasonLabel}</p>
                <p className="line-clamp-2 text-xs text-zinc-800">{s.name}</p>
                <p className="text-sm font-semibold text-teal-800">
                  {s.priceVaries ? "From " : ""}
                  {formatMoney(data.market, s.price)}
                </p>
              </div>
            </Link>
            <div className="mt-auto p-2">
              {s.addable ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => add(s)}
                  className="w-full rounded bg-teal-700 py-1 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {busy === s.id ? "Adding…" : "Add"}
                </button>
              ) : (
                <Link
                  href={`/products/${s.slug}`}
                  onClick={() => logEvent("CLICK", [s])}
                  className="block w-full rounded border border-teal-700 py-1 text-center text-xs font-semibold text-teal-800 hover:bg-teal-50"
                >
                  Choose options
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
