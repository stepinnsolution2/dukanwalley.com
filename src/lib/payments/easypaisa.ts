import { createCipheriv } from "crypto";
import {
  PAYMENT_WINDOW_MINUTES,
  pktSpaced,
  type GatewayOrder,
  type GatewayStatus,
  type PaymentRedirect,
} from "@/lib/payments/common";
import { integrationSettings } from "@/lib/integration-settings";

// Easypay (Easypaisa) hosted checkout per the Easypaisa merchant integration guide:
//  1. POST to Index.jsf with an AES-encrypted merchantHashedReq.
//  2. Easypay redirects to our first postBackURL with ?auth_token=…; we POST that to Confirm.jsf.
//  3. Easypay redirects to the final postBackURL with status params — NOT signed, so the
//     result is always verified with the inquire-transaction API before an order is marked paid.

const HOSTS = {
  sandbox: "https://easypaystg.easypaisa.com.pk",
  production: "https://easypay.easypaisa.com.pk",
} as const;

/** Credentials from Admin › Settings, falling back to .env. */
async function config() {
  const s = await integrationSettings();
  const storeId = s.EASYPAISA_STORE_ID;
  const hashKey = s.EASYPAISA_HASH_KEY;
  const username = s.EASYPAISA_USERNAME;
  const password = s.EASYPAISA_PASSWORD;
  const accountNum = s.EASYPAISA_ACCOUNT_NUM;
  // Inquiry credentials are required too: the return redirect isn't signed, so a payment
  // can only be confirmed through the inquire-transaction API.
  if (!storeId || !hashKey || !username || !password || !accountNum) return null;
  const env = s.EASYPAISA_ENV === "production" ? "production" : "sandbox";
  const host = (process.env.EASYPAISA_BASE_URL ?? HOSTS[env]).replace(/\/$/, "");
  return {
    storeId,
    hashKey,
    checkoutUrl: `${host}/easypay/Index.jsf`,
    confirmUrl: `${host}/easypay/Confirm.jsf`,
    inquiryUrl: `${host}/easypay-service/rest/v4/inquire-transaction`,
    username,
    password,
    accountNum,
  };
}

export async function isEasypaisaConfigured() {
  return (await config()) !== null;
}

/** merchantHashedReq: AES/ECB/PKCS5 of "k=v&…" (present fields, alphabetical), base64. */
export function easypaisaHashedRequest(fields: Record<string, string>, hashKey: string) {
  const plain = Object.keys(fields)
    .filter((k) => fields[k] !== "")
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join("&");
  const key = Buffer.from(hashKey, "utf8");
  const cipher = createCipheriv(`aes-${key.length * 8}-ecb`, key, null);
  return Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("base64");
}

export async function easypaisaCheckout(
  order: GatewayOrder,
  opts: { kind: "wallet" | "card"; orderRefNum: string; tokenPostBackUrl: string; mobileLocal?: string },
): Promise<PaymentRedirect> {
  const c = await config();
  if (!c) throw new Error("Easypaisa is not configured");
  const hashed: Record<string, string> = {
    amount: (order.totalMinor / 100).toFixed(1),
    autoRedirect: "1",
    emailAddr: order.customerEmail,
    expiryDate: pktSpaced(new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60_000)),
    mobileNum: opts.mobileLocal ?? "",
    orderRefNum: opts.orderRefNum,
    paymentMethod: opts.kind === "card" ? "CC_PAYMENT_METHOD" : "MA_PAYMENT_METHOD",
    postBackURL: opts.tokenPostBackUrl,
    storeId: c.storeId,
  };
  return {
    form: {
      action: c.checkoutUrl,
      fields: { ...hashed, merchantHashedReq: easypaisaHashedRequest(hashed, c.hashKey) },
    },
  };
}

/** Step 2: forward Easypay's auth_token to Confirm.jsf, naming where to return afterwards. */
export async function easypaisaConfirmForm(authToken: string, finalPostBackUrl: string) {
  const c = await config();
  if (!c) throw new Error("Easypaisa is not configured");
  return { action: c.confirmUrl, fields: { auth_token: authToken, postBackURL: finalPostBackUrl } };
}

/** Inquire-transaction API: the only trusted source of an Easypaisa payment's status. */
export async function easypaisaInquire(orderRefNum: string, expectedMinor: number): Promise<GatewayStatus> {
  const c = await config();
  if (!c) return { state: "pending", detail: "easypaisa not configured" };
  try {
    const res = await fetch(c.inquiryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Credentials: Buffer.from(`${c.username}:${c.password}`).toString("base64"),
      },
      body: JSON.stringify({ orderId: orderRefNum, storeId: c.storeId, accountNum: c.accountNum }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json()) as Record<string, string | number | undefined>;
    const status = String(j.transactionStatus ?? "").toUpperCase();
    const detail = `easypaisa ${j.responseCode ?? "?"} ${status || j.responseDesc || ""}`.trim();
    if (j.responseCode !== "0000") return { state: "pending", detail };
    if (status === "PAID") {
      const amount = j.transactionAmount;
      if (amount !== undefined && Math.round(Number(amount) * 100) !== expectedMinor) {
        return { state: "failed", detail: `${detail} amount mismatch ${amount}` };
      }
      return { state: "paid", detail };
    }
    if (status === "PENDING" || status === "") return { state: "pending", detail };
    return { state: "failed", detail }; // FAILED, BLOCKED, EXPIRED, REVERSED
  } catch (e) {
    return { state: "pending", detail: `easypaisa inquiry error ${String(e)}` };
  }
}
