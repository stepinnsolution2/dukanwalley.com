"use client";

import { useCart } from "@/components/cart-context";
import { CartContents } from "@/components/cart-contents";
import { CONTAINER } from "@/lib/page-layout";

export function CartButton() {
  const { isOpen, toggleCart } = useCart();
  return (
    <button
      type="button"
      onClick={toggleCart}
      aria-expanded={isOpen}
      aria-controls="cart-panel"
      className={isOpen ? "text-teal-700" : "hover:text-teal-700"}
    >
      Cart
    </button>
  );
}

/** Slides down from under the sticky header. Render inside the <header>. */
export function CartPanel() {
  const { cart, error, isOpen, closeCart, setQuantity } = useCart();
  return (
    <div
      className={`absolute inset-x-0 top-full overflow-hidden ${isOpen ? "" : "pointer-events-none"}`}
    >
      <div
        id="cart-panel"
        role="dialog"
        aria-label="Cart"
        inert={!isOpen}
        className={`max-h-[calc(100vh-6rem)] overflow-y-auto border-b border-zinc-200 bg-white shadow-lg transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <div className={`${CONTAINER} py-5`}>
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Cart</h2>
            <button
              type="button"
              onClick={closeCart}
              aria-label="Close cart"
              className="rounded-full px-2 text-2xl leading-none text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            >
              ×
            </button>
          </div>
          <CartContents cart={cart} error={error} onQuantity={setQuantity} showSuggestions={isOpen} />
        </div>
      </div>
    </div>
  );
}

/** Dims the page behind the panel. Render outside the <header> (its backdrop-blur traps fixed children). */
export function CartBackdrop() {
  const { isOpen, closeCart } = useCart();
  return (
    <div
      aria-hidden
      onClick={closeCart}
      className={`fixed inset-0 z-30 bg-black/30 transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    />
  );
}
