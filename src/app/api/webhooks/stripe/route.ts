import { after, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { cancelUnpaidOrder, markOrderPaid, sendOrderNotifications } from "@/lib/orders";

/**
 * Stripe Checkout webhook — the only place a card order becomes PAID.
 * Subscribe to: checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, checkout.session.expired.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await req.text(),
      req.headers.get("stripe-signature") ?? "",
      secret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      const orderId = s.metadata?.orderId;
      // Delayed methods complete the session before the money arrives.
      if (!orderId || s.payment_status !== "paid") break;
      const paymentIntentId =
        typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
      const outcome = await markOrderPaid(orderId, { paymentRef: paymentIntentId });
      if (outcome === "paid") after(() => sendOrderNotifications(orderId));
      break;
    }
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const orderId = event.data.object.metadata?.orderId;
      if (orderId) await cancelUnpaidOrder(orderId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
