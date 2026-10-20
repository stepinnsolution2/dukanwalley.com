import { getStripe } from "@/lib/stripe";
import { MARKETS, toLocalMobile, type MarketCode, type MarketPaymentMethod } from "@/lib/markets";
import { PAYMENT_WINDOW_MINUTES, type GatewayOrder, type GatewayStatus, type PaymentRedirect } from "@/lib/payments/common";
import { easypaisaCheckout, easypaisaInquire, isEasypaisaConfigured } from "@/lib/payments/easypaisa";
import { isJazzCashConfigured, jazzCashCheckout, jazzCashInquire, newJazzCashTxnRef } from "@/lib/payments/jazzcash";

export type PaymentProvider = "stripe" | "jazzcash" | "easypaisa";

/** Pakistani cards go through JazzCash unless PK_CARD_GATEWAY=easypaisa. */
function cardGateway(): "jazzcash" | "easypaisa" {
  return process.env.PK_CARD_GATEWAY === "easypaisa" ? "easypaisa" : "jazzcash";
}

export function providerFor(method: MarketPaymentMethod): PaymentProvider | null {
  switch (method) {
    case "STRIPE":
      return "stripe";
    case "JAZZCASH":
      return "jazzcash";
    case "EASYPAISA":
      return "easypaisa";
    case "CARD":
      return cardGateway();
    case "CASH_ON_DELIVERY":
      return null;
  }
}

function isConfigured(provider: PaymentProvider) {
  if (provider === "stripe") return getStripe() !== null;
  if (provider === "jazzcash") return isJazzCashConfigured();
  return isEasypaisaConfigured();
}

/** The market's methods whose gateway is configured on this server. */
export function availablePaymentMethods(market: MarketCode): MarketPaymentMethod[] {
  return MARKETS[market].paymentMethods.filter((m) => {
    const provider = providerFor(m);
    return provider === null || isConfigured(provider);
  });
}

type StartInput = {
  order: GatewayOrder;
  market: MarketCode;
  method: MarketPaymentMethod;
  lines: { title: string; unitMinor: number; quantity: number }[];
  appUrl: string;
};

/** Creates the gateway session. Returns where to send the buyer and the reference to store. */
export async function startPayment(
  input: StartInput,
): Promise<{ provider: PaymentProvider; paymentRef: string; redirect: PaymentRedirect }> {
  const { order, market, method, appUrl } = input;
  const provider = providerFor(method);
  if (!provider) throw new Error(`${method} is not an online payment`);
  const kind = method === "CARD" ? "card" : "wallet";

  if (provider === "stripe") {
    const session = await getStripe()!.checkout.sessions.create({
      mode: "payment",
      customer_email: order.customerEmail,
      client_reference_id: order.id,
      metadata: { orderId: order.id },
      expires_at: Math.floor(Date.now() / 1000) + PAYMENT_WINDOW_MINUTES * 60,
      // Unit prices already include tax, so no separate tax line.
      line_items: input.lines.map((l) => ({
        quantity: l.quantity,
        price_data: {
          currency: MARKETS[market].currency.toLowerCase(),
          unit_amount: l.unitMinor,
          product_data: { name: l.title },
        },
      })),
      success_url: `${appUrl}/checkout/success?order=${encodeURIComponent(order.orderNumber)}`,
      cancel_url: `${appUrl}/cart?payment=cancelled`,
    });
    return { provider, paymentRef: session.id, redirect: { url: session.url! } };
  }

  if (provider === "jazzcash") {
    const txnRef = newJazzCashTxnRef();
    return {
      provider,
      paymentRef: txnRef,
      redirect: jazzCashCheckout(order, {
        kind,
        txnRef,
        returnUrl: `${appUrl}/api/payments/jazzcash/return`,
      }),
    };
  }

  const orderRefNum = order.orderNumber;
  return {
    provider,
    paymentRef: orderRefNum,
    redirect: easypaisaCheckout(order, {
      kind,
      orderRefNum,
      tokenPostBackUrl: `${appUrl}/api/payments/easypaisa/token?order=${encodeURIComponent(order.id)}`,
      mobileLocal: order.customerPhone ? toLocalMobile(market, order.customerPhone) : undefined,
    }),
  };
}

/** Asks the order's gateway whether it has been paid. Never throws; unknown → pending. */
export async function inquirePayment(order: {
  paymentProvider: string | null;
  paymentIntentId: string | null;
  totalMinor: number;
}): Promise<GatewayStatus> {
  const ref = order.paymentIntentId;
  if (!ref) return { state: "failed", detail: "no gateway reference" };
  switch (order.paymentProvider) {
    case "jazzcash":
      return jazzCashInquire(ref);
    case "easypaisa":
      return easypaisaInquire(ref, order.totalMinor);
    case "stripe": {
      const stripe = getStripe();
      if (!stripe || !ref.startsWith("cs_")) return { state: "pending", detail: "stripe unavailable" };
      try {
        const s = await stripe.checkout.sessions.retrieve(ref);
        if (s.payment_status === "paid") return { state: "paid", detail: "stripe paid" };
        if (s.status === "expired") return { state: "failed", detail: "stripe session expired" };
        return { state: "pending", detail: `stripe ${s.status}/${s.payment_status}` };
      } catch (e) {
        return { state: "pending", detail: `stripe error ${String(e)}` };
      }
    }
    default:
      return { state: "failed", detail: `unknown provider ${order.paymentProvider}` };
  }
}
