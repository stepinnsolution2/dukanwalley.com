"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCart } from "@/components/cart-context";

export function HeartIcon({ filled, className = "h-5 w-5" }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.6 4.5 7.1 4.5c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3.5 0 5.7 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
    </svg>
  );
}

/** Heart toggle for a product. Works for guests too (saved on the cart session). */
export function FavoriteButton({
  productId,
  productName,
  className = "",
  withLabel = false,
}: {
  productId: string;
  productName: string;
  className?: string;
  withLabel?: boolean;
}) {
  const { favorites, toggleFavorite } = useCart();
  const [confirming, setConfirming] = useState(false);
  const on = favorites?.has(productId) ?? false;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Cards wrap the heart near a link; don't let the click navigate.
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        aria-pressed={on}
        aria-label={on ? `Remove ${productName} from favourites` : `Add ${productName} to favourites`}
        title={on ? "Remove from favourites" : "Add to favourites"}
        className={`inline-flex items-center gap-2 ${on ? "text-rose-600" : "text-zinc-500 hover:text-rose-600"} ${className}`}
      >
        <HeartIcon filled={on} />
        {withLabel ? <span className="text-sm font-medium">{on ? "Saved to favourites" : "Add to favourites"}</span> : null}
      </button>
      {confirming ? (
        <ConfirmDialog
          removing={on}
          productName={productName}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void toggleFavorite(productId);
          }}
        />
      ) : null}
    </>
  );
}

/** Small modal asking before a favourite is added or removed. Esc or clicking outside cancels. */
function ConfirmDialog({
  removing,
  productName,
  onCancel,
  onConfirm,
}: {
  removing: boolean;
  productName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // Portalled to <body>: the cart panel lives inside the header, whose backdrop blur would trap it.
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fav-confirm-title"
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className={`rounded-full p-2 ${removing ? "bg-zinc-100 text-zinc-600" : "bg-rose-50 text-rose-600"}`}>
            <HeartIcon filled={!removing} />
          </span>
          <div className="min-w-0">
            <h2 id="fav-confirm-title" className="font-semibold text-zinc-900">
              {removing ? "Remove from favourites?" : "Add to favourites?"}
            </h2>
            <p className="mt-1 break-words text-sm text-zinc-600">{productName}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
              removing ? "bg-red-600 hover:bg-red-700" : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {removing ? "Remove" : "Add"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
