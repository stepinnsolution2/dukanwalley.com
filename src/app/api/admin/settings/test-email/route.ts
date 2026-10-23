import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authz";
import { integrationSettings } from "@/lib/integration-settings";
import { getTransport, sendEmail } from "@/lib/email";

// Owner-only: send a test message to the signed-in owner with the current SMTP settings.
export async function POST() {
  const authz = await requirePermission("settings:manage");
  if (!authz.ok) return authz.response;
  const to = authz.session.user.email;
  if (!to) return NextResponse.json({ error: "Your account has no email address" }, { status: 400 });

  const transport = getTransport(await integrationSettings());
  if (!transport) return NextResponse.json({ error: "Save an SMTP host first" }, { status: 400 });
  try {
    // Surface the mail server's own error (wrong password, blocked port…) instead of a silent log.
    await transport.verify();
    await sendEmail({
      to,
      subject: "DukanWalley test email",
      text: "This is a test email from Admin › Settings. If you can read it, order emails will be delivered.",
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to });
}
