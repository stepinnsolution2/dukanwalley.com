"use client";

import Image from "next/image";
import Link from "next/link";
import { formatMoney, MARKETS } from "@/lib/markets";
import { pointsValueMinor } from "@/lib/reward-rules";
import type { Cart } from "@/components/cart-context";
import { CartSuggestions } from "@/components/cart-suggestions";
import { FavoriteButton } from "@/components/favorite-button";
import { PaymentBadges } from "@/components/payment-badges";
import { canOptimizeImage } from "@/lib/media-url";

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}

function RewardsNote({ cart }: { cart: Cart }) {
  const { signedIn, earnPoints, balance } = cart.rewards;
  const worth = (points: number) => formatMoney(cart.market, pointsValueMinor(cart.market, points) / 100);
  if (earnPoints <= 0 && !balance) return null;
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
      <span aria-hidden className="text-lg leading-none">★</span>
      <div>
        {signedIn ? (
          <p>
            You&apos;ll earn <strong className="text-amber-800">{earnPoints} points</strong> (worth {worth(earnPoints)})
            when this order is delivered.
          </p>
        ) : (
          <p>
            <Link href="/auth/login?next=/checkout" className="font-semibold text-teal-700 underline">
              Sign in
            </Link>{" "}
            to earn <strong className="text-amber-800">{earnPoints} points</strong> (worth {worth(earnPoints)}) on this
            order.
          </p>
        )}
        {signedIn && balance > 0 ? (
          <p className="mt-1 text-zinc-600">
            Your balance: {balance} points ({worth(balance)}) — use them at checkout.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function CartContents({
  cart,
  error,
  onQuantity,
  showSuggestions = true,
}: {
  cart: Cart | null;
  error: string | null;
  onQuantity: (itemId: string, quantity: number) => void;
  /** False while hidden (closed cart panel) so suggestions aren't fetched or counted as shown. */
  showSuggestions?: boolean;
}) {
  if (!cart) {
    return <p className="py-6 text-center text-zinc-600">Loading cart…</p>;
  }

  const subtotal = cart.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <div className="lg:flex lg:items-start lg:gap-8">
      <div className="min-w-0 flex-1">
        {cart.items.length > 0 ? (
          <ul className="mt-4 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {cart.items.map((item) => (
              <li key={item.id} className="flex gap-4 p-4">
                <Link
                  href={`/products/${item.product.slug}`}
                  className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-100"
                >
                  {item.product.images[0] ? (
                    <Image src={item.product.images[0].url} alt="" fill unoptimized={!canOptimizeImage(item.product.images[0].url)} className="object-cover" sizes="80px" />
                  ) : null}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/products/${item.product.slug}`} className="font-medium hover:text-teal-700">
                        {item.product.name}
                      </Link>
                      {item.variantLabel ? <p className="text-sm text-zinc-700">{item.variantLabel}</p> : null}
                      <p className="text-sm text-zinc-500">
                        {formatMoney(cart.market, item.unitPrice)} × {item.quantity}
                      </p>
                    </div>
                    <p className="font-semibold">
                      {formatMoney(cart.market, item.unitPrice * item.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onQuantity(item.id, 0)}
                        aria-label={`Remove ${item.product.name} from cart`}
                        title="Remove"
                        className="text-zinc-500 hover:text-red-600"
                      >
                        <TrashIcon />
                      </button>
                      <FavoriteButton productId={item.product.id} productName={item.product.name} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.product.name}`}
                        className="rounded border px-2 py-1 text-sm disabled:opacity-40"
                        disabled={item.quantity <= 1}
                        onClick={() => onQuantity(item.id, item.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Increase ${item.product.name}`}
                        className="rounded border px-2 py-1 text-sm"
                        onClick={() => onQuantity(item.id, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {cart.items.length === 0 ? (
          <p className="mt-4 text-zinc-600">
            Cart is empty.{" "}
            <Link href="/favorites" className="text-teal-700 underline">
              See your favourites
            </Link>
          </p>
        ) : (
          <>
            <RewardsNote cart={cart} />
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-medium">
                  Total <span className="text-teal-800">{formatMoney(cart.market, subtotal)}</span>
                </p>
                <p className="text-xs text-zinc-500">
                  Prices include {MARKETS[cart.market].taxName} where applicable ·{" "}
                  {MARKETS[cart.market].name} store
                </p>
              </div>
              <Link
                href="/checkout"
                className="rounded-lg bg-teal-700 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-teal-800"
              >
                Checkout
              </Link>
            </div>
          </>
        )}
        <div className="mt-6">
          <PaymentBadges methods={cart.paymentMethods} />
        </div>
      </div>
      <CartSuggestions active={showSuggestions} />
    </div>
  );
}
