/** Where to send the buyer to pay: a plain redirect, or a form auto-posted to the gateway. */
export type PaymentRedirect =
  | { url: string }
  | { form: { action: string; fields: Record<string, string> } };

/** Result of asking a gateway about a payment. */
export type GatewayStatus = {
  state: "paid" | "pending" | "failed";
  /** Gateway code/message for logs and admin, never shown raw to buyers. */
  detail: string;
};

/** Order fields the gateways need. Amounts are minor units (paisa). */
export type GatewayOrder = {
  id: string;
  orderNumber: string;
  totalMinor: number;
  customerEmail: string;
  customerPhone: string | null;
};

/** Online payments must complete within this window; the gateway page expires too. */
export const PAYMENT_WINDOW_MINUTES = 30;

/** Pakistan Standard Time is UTC+5 all year (no DST). Returns parts for gateway timestamps. */
function pktParts(date: Date) {
  const d = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`,
  };
}

/** yyyyMMddHHmmss in Pakistan time (JazzCash). */
export function pktCompact(date: Date) {
  const { date: d, time } = pktParts(date);
  return d + time;
}

/** "yyyyMMdd HHmmss" in Pakistan time (Easypaisa). */
export function pktSpaced(date: Date) {
  const { date: d, time } = pktParts(date);
  return `${d} ${time}`;
}

export function appBaseUrl(fallbackRequestUrl?: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (fallbackRequestUrl) return new URL(fallbackRequestUrl).origin;
  throw new Error("NEXT_PUBLIC_APP_URL must be set");
}

/** A tiny HTML page that immediately posts a form (used for gateway hand-offs). */
export function autoPostHtml(action: string, fields: Record<string, string>) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Redirecting to payment…</title></head>
<body onload="document.forms[0].submit()"><form method="post" action="${esc(action)}">${inputs}
<noscript><button type="submit">Continue to payment</button></noscript></form>
<p style="font-family:sans-serif">Redirecting to payment…</p></body></html>`;
}
