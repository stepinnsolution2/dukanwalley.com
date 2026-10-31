"use client";

import { FreeGiftBar } from "@/components/free-gift-bar";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deliveryRegions,
  DEFAULT_MARKET,
  formatMoney,
  MARKETS,
  PAYMENT_METHOD_LABELS,
  type MarketCode,
  type MarketPaymentMethod,
} from "@/lib/markets";
import { maxRedeemablePoints, pointsValueMinor } from "@/lib/reward-rules";
import { PAGE_FORM } from "@/lib/page-layout";

const continueLabels: Record<MarketPaymentMethod, string> = {
  CASH_ON_DELIVERY: "Place order",
  JAZZCASH: "Continue to JazzCash",
  EASYPAISA: "Continue to Easypaisa",
  CARD: "Continue to card payment",
  STRIPE: "Continue to card payment",
};

/** Gateways like JazzCash/Easypaisa take a form POST rather than a redirect. */
function postToGateway(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

const textFields = [
  { key: "name", placeholder: "Full name", required: true },
  { key: "line1", placeholder: "House / street / area", required: true },
  { key: "line2", placeholder: "Landmark, building, apartment (optional)", required: false },
  { key: "city", placeholder: "City", required: true },
  { key: "postalCode", placeholder: "Postal code (optional)", required: false },
] as const;

type Address = Record<(typeof textFields)[number]["key"] | "region", string>;

/** API errors are either a message string or a zod `flatten()` object. */
function errorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "fieldErrors" in error) {
    const fields = Object.keys((error as { fieldErrors: object }).fieldErrors);
    if (fields.length) return `Please check: ${fields.join(", ")}`;
  }
  return "Checkout failed";
}

export default function CheckoutPage() {
  const router = useRouter();
  const [market, setMarket] = useState<MarketCode>(DEFAULT_MARKET);
  const [methods, setMethods] = useState<MarketPaymentMethod[]>(["CASH_ON_DELIVERY"]);
  const [codNote, setCodNote] = useState<string | null>(null);
  const [giftMin, setGiftMin] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [offers, setOffers] = useState(true);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<Address>({
    name: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    postalCode: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<MarketPaymentMethod>("CASH_ON_DELIVERY");
  const [itemsMinor, setItemsMinor] = useState(0);
  const [rewards, setRewards] = useState({ signedIn: false, earnPoints: 0, balance: 0 });
  const [usePoints, setUsePoints] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = MARKETS[market];

  useEffect(() => {
    let ignore = false;
    void (async () => {
      const res = await fetch("/api/cart");
      const j = await res.json();
      if (ignore) return;
      if (j.market) setMarket(j.market);
      if (j.paymentMethods?.length) setMethods(j.paymentMethods);
      setCodNote(j.codNote ?? null);
      setGiftMin(j.freeGiftMin ?? null);
      if (j.cart?.guestEmail) setEmail(j.cart.guestEmail);
      if (j.cart?.guestPhone) setPhone(j.cart.guestPhone);
      if (j.rewards) setRewards(j.rewards);
      setItemsMinor(
        (j.cart?.items ?? []).reduce(
          (s: number, i: { quantity: number; unitPrice: number }) =>
            s + Math.round(i.unitPrice * 100) * i.quantity,
          0,
        ),
      );
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const canSubmit =
    !!email &&
    !!phone &&
    !!address.region &&
    textFields.every((f) => !f.required || address[f.key].trim());

  /** Saves the email as soon as it's typed (cart reminder if checkout isn't finished). */
  function saveEmail(wantsOffers = offers) {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return;
    void fetch("/api/checkout/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), newsletter: wantsOffers }),
    }).catch(() => null);
  }

  async function placeOrder() {
    saveEmail();
    setLoading(true);
    setError(null);
    const shippingAddress = Object.fromEntries(
      Object.entries(address)
        .map(([k, v]) => [k, v.trim()])
        .filter(([, v]) => v),
    );
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentMethod,
        customerEmail: email,
        customerPhone: phone,
        shippingAddress,
        usePoints,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setError(errorMessage(j.error));
      return;
    }
    if (j.checkoutUrl) {
      window.location.href = j.checkoutUrl;
      return;
    }
    if (j.paymentForm) {
      postToGateway(j.paymentForm.action, j.paymentForm.fields);
      return;
    }
    router.push(`/checkout/success?order=${encodeURIComponent(j.orderNumber)}`);
  }

  const input = "w-full rounded-lg border px-3 py-2 text-sm";
  // Same rule the server applies; the server recomputes from the live balance.
  const redeemable = rewards.signedIn ? maxRedeemablePoints(market, itemsMinor, rewards.balance) : 0;
  const discountMinor = usePoints ? pointsValueMinor(market, redeemable) : 0;
  const money = (minor: number) => formatMoney(market, minor / 100);

  return (
    <main className={PAGE_FORM}>
      <h1 className="text-2xl font-semibold">Checkout</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Delivering in {m.name} · prices in {m.currency}
      </p>
      <div className="mt-4 space-y-3">
        <input
          type="email"
          className={input}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => saveEmail()}
          required
        />
        <label className="flex items-start gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={offers}
            onChange={(e) => {
              setOffers(e.target.checked);
              saveEmail(e.target.checked);
            }}
          />
          <span>
            Email me offers, festive deals and new arrivals
            <span className="block text-xs text-zinc-500">Unsubscribe any time. We&apos;ll also remind you if you don&apos;t finish your order.</span>
          </span>
        </label>
        <input
          type="tel"
          className={input}
          placeholder={`Mobile number, e.g. ${m.mobileExample}`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <p className="pt-2 text-sm font-medium text-zinc-700">Delivery address</p>
        {textFields.map((f) => (
          <input
            key={f.key}
            className={input}
            placeholder={f.placeholder}
            value={address[f.key]}
            onChange={(e) => setAddress((a) => ({ ...a, [f.key]: e.target.value }))}
            required={f.required}
          />
        ))}
        <select
          className={input}
          value={address.region}
          onChange={(e) => setAddress((a) => ({ ...a, region: e.target.value }))}
          required
        >
          <option value="">{m.regionLabel}…</option>
          {deliveryRegions(m).map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <label className="block pt-2 text-sm font-medium text-zinc-700">Payment</label>
        <select
          className={input}
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as MarketPaymentMethod)}
        >
          {methods.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </option>
          ))}
        </select>
        {paymentMethod === "CASH_ON_DELIVERY" && codNote ? (
          <p className="whitespace-pre-line rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">{codNote}</p>
        ) : null}
        {redeemable > 0 ? (
          <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={usePoints}
              onChange={(e) => setUsePoints(e.target.checked)}
            />
            <span>
              Use <strong>{redeemable} reward points</strong> to save {money(pointsValueMinor(market, redeemable))}
              <span className="block text-xs text-zinc-600">
                You have {rewards.balance} points. Points can pay for up to half of an order.
              </span>
            </span>
          </label>
        ) : null}
        <FreeGiftBar market={market} itemsTotal={itemsMinor / 100} min={giftMin} />
        {itemsMinor > 0 ? (
          <dl className="space-y-1 rounded-lg border border-zinc-200 bg-white p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-600">Items</dt>
              <dd>{money(itemsMinor)}</dd>
            </div>
            {discountMinor > 0 ? (
              <div className="flex justify-between text-amber-800">
                <dt>Reward points</dt>
                <dd>−{money(discountMinor)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-zinc-100 pt-1 font-semibold">
              <dt>Total</dt>
              <dd>{money(itemsMinor - discountMinor)}</dd>
            </div>
          </dl>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          disabled={loading || !canSubmit}
          onClick={placeOrder}
          className="w-full rounded-lg bg-teal-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Placing order…" : continueLabels[paymentMethod]}
        </button>
      </div>
    </main>
  );
}
