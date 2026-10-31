// Branded HTML emails: logo header, content, optional product sections, footer with contact
// details. Table-based with inline styles so it renders in Gmail, Outlook and phone mail apps.
import { BUSINESS, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/seo";

export type EmailProduct = {
  name: string;
  /** Absolute product page URL. */
  url: string;
  /** Absolute image URL (JPEG/PNG; see emailImageUrl). */
  imageUrl: string | null;
  price: string;
  /** Shown struck through when set. */
  wasPrice?: string | null;
  /** Small label above the name, e.g. "You viewed this". */
  note?: string | null;
};

export type EmailSection = {
  title: string;
  subtitle?: string;
  products: EmailProduct[];
  /** Button under the products, e.g. back to the cart. */
  button?: { label: string; url: string };
};

export type EmailLine = { title: string; detail?: string | null; amount: string; imageUrl?: string | null; url?: string | null };

export type EmailContent = {
  /** Preview text shown next to the subject in the inbox. */
  preheader?: string;
  heading: string;
  /** Plain text; links are made clickable. */
  paragraphs: string[];
  /** Order lines with thumbnails. */
  lines?: EmailLine[];
  /** Label/value rows under the lines, e.g. Total. The last one is shown bold. */
  totals?: [string, string][];
  /** Label/value rows, e.g. delivery address. */
  details?: [string, string][];
  button?: { label: string; url: string };
  /** Small text under the button. */
  afterButton?: string[];
  sections?: EmailSection[];
  /** Footer line: why they got this email. */
  reason?: string;
  /** utm_campaign for links back to the site. */
  campaign?: string;
};

const C = {
  navy: "#16325c",
  orange: "#f47b20",
  teal: "#0f766e",
  text: "#27272a",
  muted: "#71717a",
  line: "#e4e4e7",
  bg: "#f4f4f5",
  red: "#dc2626",
};
const FONT = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Adds utm tags to links into our own site so visits from emails show up in Analytics. */
function track(url: string, campaign?: string) {
  if (!campaign || !url.startsWith(SITE_URL)) return url;
  const u = new URL(url);
  u.searchParams.set("utm_source", "email");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}

/** Escapes text and turns bare URLs into links. */
function richText(s: string, campaign?: string) {
  return escapeHtml(s).replace(
    /https?:\/\/[^\s<]+[^\s<.,;:!?)]/g,
    (u) => `<a href="${escapeHtml(track(u.replace(/&amp;/g, "&"), campaign))}" style="color:${C.teal};word-break:break-all;">${u}</a>`,
  );
}

function button(b: { label: string; url: string }, campaign?: string, color = C.teal) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 8px;"><tr><td align="center" bgcolor="${color}" style="border-radius:8px;">
<a href="${escapeHtml(track(b.url, campaign))}" style="display:inline-block;padding:13px 28px;${FONT}font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(b.label)}</a>
</td></tr></table>`;
}

function productCell(p: EmailProduct, campaign?: string) {
  const href = escapeHtml(track(p.url, campaign));
  const img = p.imageUrl
    ? `<a href="${href}"><img src="${escapeHtml(p.imageUrl)}" width="252" alt="${escapeHtml(p.name)}" style="display:block;width:100%;max-width:252px;height:auto;border:0;border-radius:8px;background:#f4f4f5;" /></a>`
    : "";
  return `<td valign="top" width="50%" style="padding:8px;">
${img}
${p.note ? `<p style="margin:8px 0 0;${FONT}font-size:11px;font-weight:600;color:${C.orange};text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(p.note)}</p>` : ""}
<p style="margin:${p.note ? "2px" : "8px"} 0 0;${FONT}font-size:14px;line-height:1.35;"><a href="${href}" style="color:${C.text};text-decoration:none;">${escapeHtml(p.name)}</a></p>
<p style="margin:4px 0 0;${FONT}font-size:15px;font-weight:700;color:${C.teal};">${escapeHtml(p.price)}${
    p.wasPrice ? ` <span style="font-size:12px;font-weight:400;color:${C.muted};text-decoration:line-through;">${escapeHtml(p.wasPrice)}</span>` : ""
  }</p>
<p style="margin:6px 0 0;${FONT}font-size:13px;"><a href="${href}" style="color:${C.orange};font-weight:600;text-decoration:none;">Shop now &rarr;</a></p>
</td>`;
}

function section(s: EmailSection, campaign?: string) {
  const rows: string[] = [];
  for (let i = 0; i < s.products.length; i += 2) {
    const pair = s.products.slice(i, i + 2);
    rows.push(`<tr>${pair.map((p) => productCell(p, campaign)).join("")}${pair.length < 2 ? '<td width="50%"></td>' : ""}</tr>`);
  }
  return `<tr><td style="padding:8px 24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};">
<tr><td colspan="2" style="padding:24px 8px 4px;${FONT}">
<p style="margin:0;font-size:18px;font-weight:700;color:${C.navy};">${escapeHtml(s.title)}</p>
${s.subtitle ? `<p style="margin:4px 0 0;font-size:13px;color:${C.muted};">${escapeHtml(s.subtitle)}</p>` : ""}
</td></tr>
${rows.join("\n")}
${s.button ? `<tr><td colspan="2">${button(s.button, campaign, C.orange)}</td></tr>` : ""}
</table></td></tr>`;
}

function linesTable(lines: EmailLine[], totals: [string, string][] | undefined, campaign?: string) {
  const row = (l: EmailLine) => {
    const thumb = l.imageUrl
      ? `<img src="${escapeHtml(l.imageUrl)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;object-fit:cover;border-radius:6px;border:0;background:#f4f4f5;" />`
      : "";
    const title = l.url
      ? `<a href="${escapeHtml(track(l.url, campaign))}" style="color:${C.text};text-decoration:none;">${escapeHtml(l.title)}</a>`
      : escapeHtml(l.title);
    return `<tr>
<td width="64" valign="top" style="padding:10px 0;border-bottom:1px solid ${C.line};">${thumb}</td>
<td valign="top" style="padding:10px 8px;border-bottom:1px solid ${C.line};${FONT}font-size:14px;color:${C.text};">${title}${
      l.detail ? `<br/><span style="font-size:12px;color:${C.muted};">${escapeHtml(l.detail)}</span>` : ""
    }</td>
<td valign="top" align="right" style="padding:10px 0;border-bottom:1px solid ${C.line};${FONT}font-size:14px;color:${C.text};white-space:nowrap;">${escapeHtml(l.amount)}</td>
</tr>`;
  };
  const totalRows = (totals ?? [])
    .map(
      ([k, v], i, all) =>
        `<tr><td></td><td style="padding:6px 8px 0;${FONT}font-size:14px;color:${i === all.length - 1 ? C.text : C.muted};${i === all.length - 1 ? "font-weight:700;" : ""}">${escapeHtml(k)}</td><td align="right" style="padding:6px 0 0;${FONT}font-size:14px;white-space:nowrap;color:${C.text};${i === all.length - 1 ? "font-weight:700;" : ""}">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">${lines.map(row).join("")}${totalRows}</table>`;
}

function detailsTable(rows: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;background:#fafafa;border:1px solid ${C.line};border-radius:8px;">${rows
    .map(
      ([k, v]) =>
        `<tr><td valign="top" style="padding:10px 12px;${FONT}font-size:13px;color:${C.muted};width:35%;">${escapeHtml(k)}</td><td style="padding:10px 12px;${FONT}font-size:14px;color:${C.text};">${escapeHtml(v).replace(/\n/g, "<br/>")}</td></tr>`,
    )
    .join("")}</table>`;
}

const FOOTER_LINKS: [string, string][] = [
  ["Shop", "/products"],
  ["Track order", "/orders/track"],
  ["Contact us", "/contact"],
  ["Shipping", "/shipping-policy"],
];

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const campaign = c.campaign;
  const home = escapeHtml(track(SITE_URL + "/", campaign));
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/><title>${escapeHtml(c.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};">
${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(c.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border-top:4px solid ${C.orange};">
<tr><td align="center" style="padding:24px 24px 12px;"><a href="${home}"><img src="${SITE_URL}/email-logo.png" width="199" height="40" alt="${SITE_NAME}" style="display:block;border:0;" /></a></td></tr>
<tr><td align="center" style="padding:0 24px 16px;${FONT}font-size:12px;color:${C.muted};">Free delivery &nbsp;&middot;&nbsp; Cash on Delivery &nbsp;&middot;&nbsp; Verified sellers</td></tr>
<tr><td style="padding:24px 32px 8px;border-top:1px solid ${C.line};${FONT}">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${C.navy};">${escapeHtml(c.heading)}</h1>
${c.paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${C.text};">${richText(p, campaign)}</p>`).join("\n")}
${c.lines?.length ? linesTable(c.lines, c.totals, campaign) : ""}
${c.details?.length ? detailsTable(c.details) : ""}
${c.button ? button(c.button, campaign) : ""}
${(c.afterButton ?? []).map((p) => `<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${C.muted};text-align:center;">${richText(p, campaign)}</p>`).join("\n")}
</td></tr>
${(c.sections ?? []).filter((s) => s.products.length).map((s) => section(s, campaign)).join("\n")}
<tr><td style="padding:24px 32px;background:${C.navy};${FONT}" align="center">
<p style="margin:0 0 12px;font-size:13px;">${FOOTER_LINKS.map(
    ([label, path]) => `<a href="${escapeHtml(track(SITE_URL + path, campaign))}" style="color:#ffffff;text-decoration:none;font-weight:600;">${label}</a>`,
  ).join(`<span style="color:#7c8db0;">&nbsp; | &nbsp;</span>`)}</p>
<p style="margin:0 0 4px;font-size:13px;color:#d4dbe8;">${SITE_NAME} &mdash; ${SITE_TAGLINE}</p>
<p style="margin:0 0 4px;font-size:12px;color:#aab6cc;">${BUSINESS.streetAddress}, ${BUSINESS.locality}, ${BUSINESS.city}</p>
<p style="margin:0;font-size:12px;color:#aab6cc;"><a href="tel:${BUSINESS.phone}" style="color:#aab6cc;text-decoration:none;">${BUSINESS.phoneDisplay}</a> &nbsp;&middot;&nbsp; <a href="mailto:${BUSINESS.email}" style="color:#aab6cc;text-decoration:none;">${BUSINESS.email}</a></p>
${c.reason ? `<p style="margin:14px 0 0;font-size:11px;line-height:1.5;color:#8796b3;">${escapeHtml(c.reason)}</p>` : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    c.heading,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.lines?.length ? [...c.lines.map((l) => `- ${l.title}${l.detail ? ` (${l.detail})` : ""}: ${l.amount}`), ""] : []),
    ...(c.totals?.length ? [...c.totals.map(([k, v]) => `${k}: ${v}`), ""] : []),
    ...(c.details?.length ? [...c.details.map(([k, v]) => `${k}: ${v.replace(/\n/g, ", ")}`), ""] : []),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`, ""] : []),
    ...(c.afterButton ?? []).flatMap((p) => [p, ""]),
    ...(c.sections ?? [])
      .filter((s) => s.products.length)
      .flatMap((s) => [s.title.toUpperCase(), ...s.products.map((p) => `- ${p.name}, ${p.price}: ${p.url}`), ""]),
    "--",
    `${SITE_NAME}: ${SITE_URL}`,
    `${BUSINESS.phoneDisplay} · ${BUSINESS.email}`,
    ...(c.reason ? ["", c.reason] : []),
  ].join("\n");
  return { html, text };
}

/** Wraps a plain-text message (staff and seller notices) in the branded layout. */
export function plainEmail(subject: string, text: string) {
  return renderEmail({ heading: subject, paragraphs: text.split(/\n+/).filter((p) => p.trim()) });
}
