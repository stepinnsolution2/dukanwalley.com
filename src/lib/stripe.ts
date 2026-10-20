import Stripe from "stripe";

let client: Stripe | null = null;

/** Null when STRIPE_SECRET_KEY is unset, so card checkout can be turned off cleanly. */
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}
