"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { useCart } from "@/components/cart-context";
import { formatMoney, type MarketCode } from "@/lib/markets";
import { isColorKey } from "@/lib/variants";
import { useProductSelection } from "./product-selection";

export type PickerVariant = { id: string; options: Record<string, string>; stock: number; price: number | null };
export type PickerAxis = { key: string; name: string; values: string[] };

export function AddToCart({
  productId,
  disabled,
  market,
  basePrice,
  showStockCount = true,
  axes = [],
  variants = [],
}: {
  productId: string;
  disabled?: boolean;
  market: MarketCode;
  basePrice: number;
  /** false: say "In stock" instead of how many are left. */
  showStockCount?: boolean;
  axes?: PickerAxis[];
  variants?: PickerVariant[];
}) {
  const { openCart } = useCart();
  const { status } = useSession();
  const { setColor } = useProductSelection();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasVariants = variants.length > 0;
  const missing = axes.find((a) => !selected[a.key]);
  const variant = hasVariants && !missing
    ? variants.find((v) => axes.every((a) => v.options[a.key] === selected[a.key]))
    : undefined;

  /** A value is available if some in-stock variant has it and matches the other picks. */
  function available(axisKey: string, value: string) {
    return variants.some(
      (v) =>
        v.stock > 0 &&
        v.options[axisKey] === value &&
        axes.every((a) => a.key === axisKey || !selected[a.key] || v.options[a.key] === selected[a.key]),
    );
  }

  function pick(axisKey: string, value: string) {
    setError(null);
    const next = { ...selected, [axisKey]: selected[axisKey] === value ? "" : value };
    setSelected(next);
    if (isColorKey(axisKey)) setColor(next[axisKey] || null);
  }

  async function add() {
    if (missing) {
      setError(`Please select a ${missing.name.toLowerCase()}`);
      return;
    }
    if (hasVariants && (!variant || variant.stock <= 0)) {
      setError("That combination is sold out");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          variantId: variant?.id,
          quantity: 1,
          guestEmail: email || undefined,
          guestPhone: phone || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Please check your email and phone");
        return;
      }
      openCart();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      {axes.map((axis) => (
        <div key={axis.key}>
          <p className="text-sm font-medium text-zinc-800">
            {axis.name}
            {selected[axis.key] ? <span className="font-normal text-zinc-600">: {selected[axis.key]}</span> : null}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {axis.values.map((value) => {
              const on = selected[axis.key] === value;
              const ok = available(axis.key, value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => pick(axis.key, value)}
                  aria-pressed={on}
                  title={ok ? undefined : "Sold out"}
                  className={`min-w-11 rounded-lg border px-3 py-1.5 text-sm transition ${
                    on
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : ok
                        ? "border-zinc-300 bg-white hover:border-zinc-900"
                        : "border-dashed border-zinc-300 bg-white text-zinc-400 line-through"
                  }`}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {variant ? (
        <p className="text-sm">
          {variant.price != null && variant.price !== basePrice ? (
            <span className="mr-2 font-semibold text-teal-800">{formatMoney(market, variant.price)}</span>
          ) : null}
          {variant.stock <= 0 ? (
            <span className="text-red-600">Sold out</span>
          ) : showStockCount && variant.stock <= 5 ? (
            <span className="text-amber-700">Only {variant.stock} left</span>
          ) : (
            <span className="text-zinc-600">In stock</span>
          )}
        </p>
      ) : null}

      {/* Signed-in shoppers are reminded at their account's email/phone. */}
      {status === "unauthenticated" ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600 hover:text-teal-700">
            Remind me if I leave items in my cart (optional)
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              type="email"
              placeholder="Email"
              aria-label="Email for cart reminders"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
            <input
              type="tel"
              placeholder="Phone"
              aria-label="Phone for cart reminders"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </div>
        </details>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={add}
        className="w-full rounded-lg bg-teal-700 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {loading ? "Adding…" : "Add to cart"}
      </button>
    </div>
  );
}
