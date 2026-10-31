import { NextResponse } from "next/server";
import { captureEmail, unsubscribe, verifyUnsubscribeToken } from "@/lib/marketing";

/**
 * One-click unsubscribe (RFC 8058): Gmail and Apple Mail POST here from their own
 * "Unsubscribe" button via the List-Unsubscribe header. The /unsubscribe page posts here too,
 * with `action=resubscribe` to undo. Links are signed per address.
 */
export async function POST(req: Request) {
  const sp = new URL(req.url).searchParams;
  const email = sp.get("e") ?? "";
  const token = sp.get("t") ?? "";
  if (!email || !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }
  if (sp.get("action") === "resubscribe") {
    await captureEmail({ email, source: "website", newsletter: true });
  } else {
    await unsubscribe(email);
  }
  // Forms from the page come back to it; mail apps only need a 200.
  if (req.headers.get("content-type")?.includes("application/x-www-form-urlencoded") && sp.get("from") === "page") {
    const back = new URL("/unsubscribe", req.url);
    back.searchParams.set("e", email);
    back.searchParams.set("t", token);
    back.searchParams.set("done", sp.get("action") === "resubscribe" ? "resubscribed" : "unsubscribed");
    return NextResponse.redirect(back, 303);
  }
  return NextResponse.json({ ok: true });
}
