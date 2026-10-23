import nodemailer from "nodemailer";
import { integrationSettings, type IntegrationSettings } from "@/lib/integration-settings";

/** SMTP from Admin › Settings, falling back to .env. Null when no host is set (emails are logged). */
export function getTransport(s: IntegrationSettings) {
  const host = s.SMTP_HOST;
  if (!host) return null;
  const port = Number(s.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host,
    port,
    // 465 is implicit TLS; other ports (587) upgrade with STARTTLS.
    secure: port === 465,
    connectionTimeout: 15_000,
    auth: s.SMTP_USER && s.SMTP_PASSWORD ? { user: s.SMTP_USER, pass: s.SMTP_PASSWORD } : undefined,
  });
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const s = await integrationSettings();
  const from = s.EMAIL_FROM ?? "DukanWalley <noreply@localhost>";
  const transport = getTransport(s);
  if (!transport) {
    console.info("[email:stub]", { from, ...opts });
    return;
  }
  await transport.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? opts.text.replace(/\n/g, "<br/>"),
  });
}
