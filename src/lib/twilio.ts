import { createHmac, timingSafeEqual } from "crypto";

// Twilio SMS + WhatsApp. Without TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN, messages are only
// logged (safe for local dev) and reported as sent.

export type SendResult = { ok: true; sid: string | null } | { ok: false; error: string };

function creds() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  return sid && token ? { sid, token } : null;
}

async function createMessage(params: Record<string, string>): Promise<SendResult> {
  const c = creds();
  if (!c) {
    console.info("[twilio:stub]", params);
    return { ok: true, sid: null };
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${c.sid}:${c.token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (!res.ok) return { ok: false, error: `twilio ${j.code ?? res.status}: ${j.message ?? ""}` };
    return { ok: true, sid: j.sid ?? null };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function sendSms(to: string, body: string): Promise<SendResult> {
  const from = process.env.TWILIO_FROM;
  if (creds() && !from) return { ok: false, error: "TWILIO_FROM not set" };
  const result = await createMessage({ To: to, From: from ?? "stub", Body: body });
  if (!result.ok) console.error("[sms]", to, result.error);
  return result;
}

export function isWhatsAppConfigured() {
  return creds() !== null && !!process.env.TWILIO_WHATSAPP_FROM;
}

/**
 * WhatsApp via Twilio. Messages a business starts must use an approved template
 * (contentSid + variables); plain `body` only works inside a 24h customer session or the sandbox.
 */
export async function sendWhatsApp(
  to: string,
  msg: {
    body: string;
    contentSid?: string;
    variables?: Record<string, string>;
    statusCallback?: string;
  },
): Promise<SendResult> {
  if (!isWhatsAppConfigured()) return { ok: false, error: "whatsapp not configured" };
  const params: Record<string, string> = {
    To: `whatsapp:${to}`,
    From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
  };
  if (msg.contentSid) {
    params.ContentSid = msg.contentSid;
    params.ContentVariables = JSON.stringify(msg.variables ?? {});
  } else {
    params.Body = msg.body;
  }
  if (msg.statusCallback) params.StatusCallback = msg.statusCallback;
  return createMessage(params);
}

/**
 * X-Twilio-Signature: base64 HMAC-SHA1 (auth token) of the full URL followed by each
 * POST param name+value, sorted by name.
 */
export function isValidTwilioSignature(url: string, params: Record<string, string>, signature: string) {
  const c = creds();
  if (!c || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = Buffer.from(createHmac("sha1", c.token).update(data, "utf8").digest("base64"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
