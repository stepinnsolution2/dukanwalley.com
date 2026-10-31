"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { MarketCode, MarketPaymentMethod } from "@/lib/markets";

export type Cart = {
  id: string;
  market: MarketCode;
  paymentMethods: MarketPaymentMethod[];
  rewards: { signedIn: boolean; earnPoints: number; balance: number };
  items: {
    id: string;
    quantity: number;
    /** Variant price if set, else the product's price. */
    unitPrice: number;
    /** e.g. "Size: 41 · Color: Yellow" */
    variantLabel: string | null;
    product: { id: string; slug: string; name: string; basePrice: unknown; images: { url: string }[] };
  }[];
};

type CartContextValue = {
  cart: Cart | null;
  error: string | null;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  reload: () => Promise<void>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  /** Product ids the shopper has favourited; null until loaded. */
  favorites: Set<string> | null;
  toggleFavorite: (productId: string) => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

async function fetchCart(): Promise<Cart> {
  const res = await fetch("/api/cart");
  const j = await res.json();
  return { ...j.cart, market: j.market, paymentMethods: j.paymentMethods ?? [], rewards: j.rewards };
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string> | null>(null);
  const pathname = usePathname();

  const reload = useCallback(async () => {
    setCart(await fetchCart());
  }, []);

  // Fetched lazily: GET /api/cart creates a cart, so don't call it for every visitor.
  const openCart = useCallback(() => {
    setIsOpen(true);
    void reload();
  }, [reload]);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => {
    if (isOpen) closeCart();
    else openCart();
  }, [isOpen, openCart, closeCart]);

  const setQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      setError(null);
      const res = await fetch("/api/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, quantity }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Could not update cart");
      }
      await reload();
    },
    [reload],
  );

  // Favourites are cheap to read (no session is created), so load them up front for the hearts.
  useEffect(() => {
    let ignore = false;
    void fetch("/api/favorites")
      .then((r) => r.json())
      .then((j) => {
        if (!ignore) setFavorites(new Set(j.productIds ?? []));
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const toggleFavorite = useCallback(
    async (productId: string) => {
      const was = favorites?.has(productId) ?? false;
      const flip = (on: boolean) =>
        setFavorites((prev) => {
          const next = new Set(prev);
          if (on) next.add(productId);
          else next.delete(productId);
          return next;
        });
      flip(!was); // optimistic
      const res = await fetch("/api/favorites", {
        method: was ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      }).catch(() => null);
      if (!res?.ok) flip(was);
    },
    [favorites],
  );

  // Close when navigating (e.g. clicking Checkout) and on Escape.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setIsOpen(false);
  }
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <CartContext.Provider
      value={{
        cart,
        error,
        isOpen,
        openCart,
        closeCart,
        toggleCart,
        reload,
        setQuantity,
        favorites,
        toggleFavorite,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
