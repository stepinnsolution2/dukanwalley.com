import { createHmac, randomInt, timingSafeEqual } from "crypto";
import {
  PAYMENT_WINDOW_MINUTES,
  pktCompact,
  type GatewayOrder,
  type GatewayStatus,
  type PaymentRedirect,
} from "@/lib/payments/common";

// JazzCash Payment Portal ("page redirection") per the JazzCash merchant integration guide v4.2.
// The buyer is posted to JazzCash's hosted page; the result is posted back to pp_ReturnURL,
// signed with pp_SecureHash. Every URL can be overridden because JazzCash issues production
// endpoints to each merchant after approval.

const URLS = {
  sandbox: {
    checkout: "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
    inquiry: "https://sandbox.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire",
  },
  production: {
    checkout: "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
    inquiry: undefined, // issued by JazzCash on approval; set JAZZCASH_INQUIRY_URL
  },
} as const;

/** Codes meaning the money is received. 121 = confirmed by merchant. */
const PAID_CODES = new Set(["000", "121"]);
/** Waiting on the customer or bank (wallet approval, OTC, 3DS). */
const PENDING_CODES = new Set(["124", "157", "210"]);

function config() {
  const merchantId = process.env.JAZZCASH_MERCHANT_ID;
  const password = process.env.JAZZCASH_PASSWORD;
  const salt = process.env.JAZZCASH_INTEGRITY_SALT;
  if (!merchantId || !password || !salt) return null;
  const env = process.env.JAZZCASH_ENV === "production" ? "production" : "sandbox";
  return {
    merchantId,
    password,
    salt,
    version: process.env.JAZZCASH_VERSION ?? "1.1",
    checkoutUrl: process.env.JAZZCASH_CHECKOUT_URL ?? URLS[env].checkout,
    inquiryUrl: process.env.JAZZCASH_INQUIRY_URL ?? URLS[env].inquiry,
    txnType: {
      wallet: process.env.JAZZCASH_WALLET_TXN_TYPE ?? "MWALLET",
      card: process.env.JAZZCASH_CARD_TXN_TYPE ?? "MPAY",
    },
  };
}

export function isJazzCashConfigured() {
  return config() !== null;
}

/**
 * pp_SecureHash: HMAC-SHA256 keyed with the integrity salt, over
 * salt & value1 & value2 … for all non-empty pp_* fields sorted by field name.
 */
export function jazzCashSecureHash(fields: Record<string, string>, salt: string) {
  const values = Object.keys(fields)
    .filter((k) => k.toLowerCase().startsWith("pp") && k !== "pp_SecureHash" && fields[k] !== "")
    .sort()
    .map((k) => fields[k]);
  return createHmac("sha256", salt)
    .update([salt, ...values].join("&"), "utf8")
    .digest("hex")
    .toUpperCase();
}

/** JazzCash allows 20 chars of letters/digits (plus '.' in bill references). */
function billReference(orderNumber: string) {
  return orderNumber.replace(/[^A-Za-z0-9]/g, "").slice(-20);
}

/** Unique per attempt: T + yyyyMMddHHmmss + 5 digits = 20 chars. */
export function newJazzCashTxnRef() {
  return `T${pktCompact(new Date())}${String(randomInt(0, 100000)).padStart(5, "0")}`;
}

export function jazzCashCheckout(
  order: GatewayOrder,
  opts: { kind: "wallet" | "card"; txnRef: string; returnUrl: string },
): PaymentRedirect {
  const c = config();
  if (!c) throw new Error("JazzCash is not configured");
  const now = new Date();
  const fields: Record<string, string> = {
    pp_Version: c.version,
    pp_TxnType: c.txnType[opts.kind],
    pp_Language: "EN",
    pp_MerchantID: c.merchantId,
    pp_SubMerchantID: "",
    pp_Password: c.password,
    pp_BankID: "",
    pp_ProductID: "",
    pp_TxnRefNo: opts.txnRef,
    pp_Amount: String(order.totalMinor),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: pktCompact(now),
    pp_BillReference: billReference(order.orderNumber),
    pp_Description: `Order ${order.orderNumber}`,
    pp_TxnExpiryDateTime: pktCompact(new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * 60_000)),
    pp_ReturnURL: opts.returnUrl,
  };
  fields.pp_SecureHash = jazzCashSecureHash(fields, c.salt);
  return { form: { action: c.checkoutUrl, fields } };
}

/** Checks the pp_SecureHash on a response posted back by JazzCash. */
export function verifyJazzCashResponse(fields: Record<string, string>) {
  const c = config();
  if (!c || !fields.pp_SecureHash) return false;
  const expected = Buffer.from(jazzCashSecureHash(fields, c.salt));
  const given = Buffer.from(fields.pp_SecureHash.toUpperCase());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function jazzCashStatusFromCode(code: string | undefined, message?: string): GatewayStatus {
  const detail = `jazzcash ${code ?? "?"}${message ? ` ${message}` : ""}`;
  if (code && PAID_CODES.has(code)) return { state: "paid", detail };
  if (code && PENDING_CODES.has(code)) return { state: "pending", detail };
  return { state: "failed", detail };
}

/** Asks JazzCash for the current status of a transaction (Payment Inquiry API). */
export async function jazzCashInquire(txnRef: string): Promise<GatewayStatus> {
  const c = config();
  if (!c?.inquiryUrl) return { state: "pending", detail: "jazzcash inquiry not configured" };
  const body: Record<string, string> = {
    pp_TxnRefNo: txnRef,
    pp_MerchantID: c.merchantId,
    pp_Password: c.password,
    pp_Version: c.version,
  };
  body.pp_SecureHash = jazzCashSecureHash(body, c.salt);
  try {
    const res = await fetch(c.inquiryUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json()) as Record<string, string>;
    // pp_ResponseCode is the inquiry call itself; pp_PaymentResponseCode is the payment.
    if (j.pp_ResponseCode !== "000") {
      return { state: "pending", detail: `jazzcash inquiry ${j.pp_ResponseCode} ${j.pp_ResponseMessage ?? ""}` };
    }
    return jazzCashStatusFromCode(j.pp_PaymentResponseCode, j.pp_PaymentResponseMessage);
  } catch (e) {
    // Unknown is not failure: leave the order pending and ask again later.
    return { state: "pending", detail: `jazzcash inquiry error ${String(e)}` };
  }
}
