import { after, NextResponse } from "next/server";
import { sendCodConfirmationSmsFallback } from "@/lib/orders";
import { appBaseUrl } from "@/lib/payments/common";
import { isValidTwilioSignature } from "@/lib/twilio";

const UNDELIVERED = new Set(["failed", "undelivered"]);

/**
 * Twilio message status callback (set per message). When a WhatsApp COD confirmation
 * can't be delivered — e.g. the number isn't on WhatsApp — send the link by SMS instead.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const params: Record<string, string> = {};
  for (const [k, v] of form ?? []) if (typeof v === "string") params[k] = v;

  // Twilio signs the exact public URL it called, which is our configured app URL.
  const app = appBaseUrl(req.url);
  const url = `${app}/api/webhooks/twilio/status`;
  if (!isValidTwilioSignature(url, params, req.headers.get("x-twilio-signature") ?? "")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  if (UNDELIVERED.has(params.MessageStatus) && params.MessageSid) {
    after(() => sendCodConfirmationSmsFallback(params.MessageSid, app));
  }
  return new NextResponse(null, { status: 204 });
}
