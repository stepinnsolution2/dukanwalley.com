import nodemailer from "nodemailer";
import { integrationSettings, type IntegrationSettings } from "@/lib/integration-settings";
import { plainEmail, renderEmail, type EmailContent } from "@/lib/email-layout";

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

/**
 * Sends one email in the branded layout: pass `content` for a designed email, or just `text`
 * (wrapped with the logo header and footer).
 */
export async function sendEmail(opts: { to: string; subject: string } & ({ content: EmailContent } | { text: string })) {
  // Imported stores have placeholder logins (…@marketplace.internal) that can't receive mail;
  // sending there would only bounce and hurt the sender reputation.
  if (/\.internal$/i.test(opts.to.trim())) return;
  const { html, text } = "content" in opts ? renderEmail(opts.content) : plainEmail(opts.subject, opts.text);
  const s = await integrationSettings();
  const from = s.EMAIL_FROM ?? "DukanWalley <noreply@localhost>";
  const transport = getTransport(s);
  if (!transport) {
    console.info("[email:stub]", { from, to: opts.to, subject: opts.subject, text });
    return;
  }
  await transport.sendMail({ from, to: opts.to, subject: opts.subject, text, html });
}
