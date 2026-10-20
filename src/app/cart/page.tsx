"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/components/cart-context";
import { CartContents } from "@/components/cart-contents";
import { PAGE_WIDE } from "@/lib/page-layout";

// The cart normally opens as a slide-down panel from the header. This page stays
// as the landing spot for payment gateways that redirect back on failure/cancel.
export default function CartPage() {
  const { cart, error, reload, setQuantity } = useCart();
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    const payment = new URLSearchParams(window.location.search).get("payment");
    void reload().then(() => {
      if (payment === "failed") setPaymentError("The payment didn't go through. You haven't been charged — please try again.");
      if (payment === "cancelled") setPaymentError("Payment cancelled. Your cart is still here.");
    });
  }, [reload]);

  return (
    <main className={PAGE_WIDE}>
      <h1 className="text-2xl font-semibold">Cart</h1>
      <CartContents cart={cart} error={error ?? paymentError} onQuantity={setQuantity} />
    </main>
  );
}
