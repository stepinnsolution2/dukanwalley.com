// Newsletter campaigns: build the email from a template, queue it for every subscriber, and
// send the queue a batch at a time (cron) within the daily marketing limit.
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import type { EmailContent, EmailProduct, EmailSection } from "@/lib/email-layout";
import { storefrontProductWhere } from "@/lib/catalog";
import { emailImageUrl, ownerFor, shopperSections } from "@/lib/customer-emails";
import { formatMoney, type MarketCode } from "@/lib/markets";
import { marketingEmailsLeftToday, unsubscribeLinks } from "@/lib/marketing";
import { getTemplate, type SlotValues } from "@/lib/newsletter-templates";
import { SITE_URL } from "@/lib/seo";

/** Most newsletters sent per cron run (every 10 minutes), to stay well under SMTP rate limits. */
const BATCH = 40;

export type CampaignDraft = {
  id?: string;
  name: string;
  template: string;
  subject: string;
  preheader: string;
  content: SlotValues;
  market: MarketCode;
  personalPicks: boolean;
};

const str = (v: SlotValues[string]) => (typeof v === "string" ? v.trim() : "");
const paragraphs = (v: SlotValues[string]) =>
  str(v)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
/** Links typed as "/category/x" become absolute; anything else must be http(s). */
const link = (v: SlotValues[string]) => {
  const s = str(v);
  if (!s) return null;
  if (s.startsWith("/")) return SITE_URL + s;
  return /^https?:\/\//.test(s) ? s : null;
};

/** The picked products, in the admin's order, that are still live in the market. */
export async function campaignProducts(ids: string[], market: MarketCode): Promise<EmailProduct[]> {
  if (!ids.length) return [];
  const rows = await prisma.product.findMany({
    where: { ...storefrontProductWhere(market), id: { in: ids } },
    select: {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      compareAtPrice: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
      variants: { select: { price: true } },
    },
  });
  const byId = new Map(rows.map((p) => [p.id, p]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];
    const prices = p.variants.map((v) => Number(v.price ?? p.basePrice));
    const price = prices.length ? Math.min(...prices) : Number(p.basePrice);
    const varies = prices.some((x) => x !== price);
    const was = p.compareAtPrice == null ? 0 : Number(p.compareAtPrice);
    return [
      {
        name: p.name,
        url: `${SITE_URL}/products/${p.slug}`,
        imageUrl: emailImageUrl(p.images[0]?.url),
        price: `${varies ? "From " : ""}${formatMoney(market, price)}`,
        wasPrice: !varies && was > price ? formatMoney(market, was) : null,
      },
    ];
  });
}

/**
 * The email for one reader (or a preview with no reader). Personal picks use the reader's cart
 * and browsing; a preview shows what a reader with no history would get.
 */
export async function buildNewsletterContent(c: CampaignDraft, email?: string): Promise<EmailContent> {
  const v = c.content;
  const template = getTemplate(c.template);
  const productIds = (Array.isArray(v.products) ? v.products : []).slice(0, template.slots.find((s) => s.key === "products")?.max ?? 8);
  const products = await campaignProducts(productIds, c.market);

  const sections: EmailSection[] = [];
  if (products.length) sections.push({ title: str(v.productsTitle) || "Shop the collection", products });
  if (c.personalPicks) {
    const owner = email ? await ownerFor({ email }) : null;
    const personal = await shopperSections({ owner, market: c.market, exclude: productIds }).catch(() => []);
    sections.push(...personal);
  }

  const heroImage = emailImageUrl(str(v.heroImage) || null, true);
  const buttonUrl = link(v.buttonLink);
  const links = email ? unsubscribeLinks(email) : null;
  return {
    preheader: c.preheader || undefined,
    heading: str(v.headline) || c.subject || c.name,
    paragraphs: paragraphs(v.message),
    badge: str(v.badge) || undefined,
    accent: str(v.accent) || undefined,
    hero: heroImage ? { imageUrl: heroImage, url: link(v.heroLink) ?? buttonUrl ?? undefined, alt: str(v.headline) } : undefined,
    button: buttonUrl ? { label: str(v.buttonLabel) || "Shop now", url: buttonUrl } : undefined,
    sections,
    outro: paragraphs(v.closing),
    campaign: `newsletter-${c.id ?? "preview"}`,
    reason: "You're receiving this email because you signed up for DukanWalley offers and news.",
    unsubscribeUrl: links?.page ?? `${SITE_URL}/unsubscribe`,
  };
}

/** Everyone a campaign goes to: active newsletter subscribers in its market (or no market yet). */
export function audienceWhere(market: MarketCode) {
  return {
    status: "ACTIVE",
    newsletter: true,
    OR: [{ market }, { market: null }],
    NOT: { email: { endsWith: ".internal" } },
  };
}

/** Puts one email per subscriber in the queue and marks the campaign as sending. */
export async function queueCampaign(campaignId: string) {
  const campaign = await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  const subscribers = await prisma.newsletterSubscriber.findMany({ where: audienceWhere(campaign.market), select: { email: true } });
  await prisma.newsletterSend.createMany({
    data: subscribers.map((s) => ({ campaignId, email: s.email })),
    skipDuplicates: true,
  });
  const recipients = await prisma.newsletterSend.count({ where: { campaignId } });
  await prisma.newsletterCampaign.update({
    where: { id: campaignId },
    data: { status: "SENDING", recipients, startedAt: campaign.startedAt ?? new Date() },
  });
  return recipients;
}

/** Sends the next batch of queued newsletters. Called by the cron job and right after "Send". */
export async function processNewsletterQueue() {
  let left = Math.min(BATCH, await marketingEmailsLeftToday());
  const summary = { sent: 0, failed: 0, skipped: 0, limitReached: left === 0 };
  if (!left) return summary;

  const campaigns = await prisma.newsletterCampaign.findMany({ where: { status: "SENDING" }, orderBy: { startedAt: "asc" } });
  for (const campaign of campaigns) {
    if (!left) break;
    const draft: CampaignDraft = { ...campaign, content: (campaign.content ?? {}) as SlotValues };
    const queued = await prisma.newsletterSend.findMany({ where: { campaignId: campaign.id, status: "QUEUED" }, take: left });
    for (const send of queued) {
      // Claim it, so two runs at once never send the same email twice.
      const claimed = await prisma.newsletterSend.updateMany({ where: { id: send.id, status: "QUEUED" }, data: { status: "SENDING" } });
      if (!claimed.count) continue;
      const sub = await prisma.newsletterSubscriber.findUnique({ where: { email: send.email }, select: { status: true, newsletter: true } });
      if (sub?.status !== "ACTIVE" || !sub.newsletter) {
        await prisma.newsletterSend.update({ where: { id: send.id }, data: { status: "SKIPPED", error: "Unsubscribed" } });
        summary.skipped += 1;
        continue;
      }
      try {
        const content = await buildNewsletterContent(draft, send.email);
        await sendEmail({ to: send.email, subject: campaign.subject, content, listUnsubscribe: unsubscribeLinks(send.email).oneClick });
        await prisma.newsletterSend.update({ where: { id: send.id }, data: { status: "SENT", sentAt: new Date() } });
        summary.sent += 1;
        left -= 1;
      } catch (e) {
        await prisma.newsletterSend.update({
          where: { id: send.id },
          data: { status: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 300) },
        });
        summary.failed += 1;
      }
      if (!left) break;
    }
    await refreshCampaignCounts(campaign.id);
  }
  return summary;
}

/** Updates sent/failed counts, and marks the campaign SENT when its queue is empty. */
export async function refreshCampaignCounts(campaignId: string) {
  const counts = await prisma.newsletterSend.groupBy({ by: ["status"], where: { campaignId }, _count: { _all: true } });
  const n = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  // A send left "SENDING" by a crash mid-email is not retried (it may have gone out).
  const pending = n("QUEUED");
  await prisma.newsletterCampaign.updateMany({
    where: { id: campaignId, status: "SENDING" },
    data: { sentCount: n("SENT"), failedCount: n("FAILED"), ...(pending ? {} : { status: "SENT", finishedAt: new Date() }) },
  });
}
