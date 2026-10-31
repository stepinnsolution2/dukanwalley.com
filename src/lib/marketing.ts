// Email marketing rules shared by the sign-up forms, cart reminders and newsletters:
// who we may email, the unsubscribe link, and the daily sending limit.
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { integrationSettings } from "@/lib/integration-settings";
import type { MarketCode } from "@/lib/markets";
import { SITE_URL } from "@/lib/seo";
import { NotificationCampaignType } from "@/generated/prisma/enums";

const normal = (email: string) => email.trim().toLowerCase();

/**
 * Records an email address. Never re-subscribes someone who unsubscribed (unless they asked
 * for newsletters again themselves) and never turns newsletters off for an existing subscriber.
 */
export async function captureEmail(opts: {
  email: string;
  source: string;
  /** They asked for newsletters (sign-up form, or ticked the box at checkout). */
  newsletter: boolean;
  market?: MarketCode | null;
  phone?: string | null;
}) {
  const email = normal(opts.email);
  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  if (!existing) {
    return prisma.newsletterSubscriber.create({
      data: { email, source: opts.source, newsletter: opts.newsletter, market: opts.market ?? null, phone: opts.phone || null },
    });
  }
  const resubscribe = opts.newsletter && existing.status === "UNSUBSCRIBED";
  return prisma.newsletterSubscriber.update({
    where: { email },
    data: {
      ...(opts.newsletter ? { newsletter: true } : {}),
      ...(resubscribe ? { status: "ACTIVE", unsubscribedAt: null } : {}),
      ...(!existing.market && opts.market ? { market: opts.market } : {}),
      ...(!existing.phone && opts.phone ? { phone: opts.phone } : {}),
    },
  });
}

/** Cart reminders and newsletters skip anyone who unsubscribed. */
export async function isUnsubscribed(email: string) {
  const s = await prisma.newsletterSubscriber.findUnique({ where: { email: normal(email) }, select: { status: true } });
  return s?.status === "UNSUBSCRIBED";
}

/** Short signature for links in emails (unsubscribe, restore cart). */
function sign(purpose: string, value: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.SETTINGS_ENCRYPTION_KEY ?? "dev-secret";
  return createHmac("sha256", `${purpose}:${secret}`).update(value).digest("base64url").slice(0, 24);
}

function verify(purpose: string, value: string, token: string) {
  const want = Buffer.from(sign(purpose, value));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

const unsubscribeToken = (email: string) => sign("unsubscribe", normal(email));

export function verifyUnsubscribeToken(email: string, token: string) {
  return verify("unsubscribe", normal(email), token);
}

/** Link in cart reminders that opens the cart in whatever browser the email is read in. */
export function restoreCartUrl(cartId: string) {
  return `${SITE_URL}/cart/restore?c=${encodeURIComponent(cartId)}&t=${sign("cart", cartId)}`;
}

export function verifyRestoreCartToken(cartId: string, token: string) {
  return verify("cart", cartId, token);
}

/** Page link (footer of marketing emails) and the one-click URL for the List-Unsubscribe header. */
export function unsubscribeLinks(email: string) {
  const qs = `e=${encodeURIComponent(normal(email))}&t=${unsubscribeToken(email)}`;
  return { page: `${SITE_URL}/unsubscribe?${qs}`, oneClick: `${SITE_URL}/api/unsubscribe?${qs}` };
}

export async function unsubscribe(email: string) {
  const e = normal(email);
  await prisma.newsletterSubscriber.upsert({
    where: { email: e },
    update: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
    create: { email: e, status: "UNSUBSCRIBED", unsubscribedAt: new Date(), newsletter: false, source: "unsubscribe" },
  });
}

export type MarketingSettings = { popup: boolean; cartReminders: boolean; dailyLimit: number };

export async function marketingSettings(): Promise<MarketingSettings> {
  const s = await integrationSettings();
  const limit = Number(s.MARKETING_DAILY_LIMIT ?? 80);
  return {
    popup: s.EMAIL_POPUP !== "off",
    cartReminders: s.CART_REMINDERS !== "off",
    dailyLimit: Number.isFinite(limit) ? limit : 80,
  };
}

export const POPUP_HEADLINE_DEFAULT = "Free gift on orders above Rs {amount}";
export const POPUP_TEXT_DEFAULT =
  "Join DukanWalley with your email: be first to hear about sales and new arrivals, and remember that every order above Rs {amount} comes with a free gift.";

/** Items total (Pakistan, in rupees) that earns a free gift; null when there is no offer. */
export async function freeGiftMinOrder(market: MarketCode): Promise<number | null> {
  if (market !== "PK") return null;
  const n = Number((await integrationSettings()).FREE_GIFT_MIN_ORDER ?? "");
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The sign-up pop-up's offer wording, or null for the plain sign-up box. */
export async function popupOffer(): Promise<{ amount: number; headline: string; text: string } | null> {
  const s = await integrationSettings();
  const amount = Number(s.FREE_GIFT_MIN_ORDER ?? "");
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const fill = (t: string) => t.replace(/\{amount\}/g, amount.toLocaleString("en-PK"));
  return { amount, headline: fill(s.POPUP_HEADLINE || POPUP_HEADLINE_DEFAULT), text: fill(s.POPUP_TEXT || POPUP_TEXT_DEFAULT) };
}

/** Marketing emails (cart reminders + newsletters) still allowed today (Pakistan day). */
export async function marketingEmailsLeftToday() {
  const { dailyLimit } = await marketingSettings();
  const pkNow = new Date(Date.now() + 5 * 3600_000);
  const dayStart = new Date(Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), pkNow.getUTCDate()) - 5 * 3600_000);
  const [reminders, newsletters] = await Promise.all([
    prisma.notificationCampaignLog.count({ where: { type: NotificationCampaignType.ABANDONED_CART, sentAt: { gte: dayStart } } }),
    prisma.newsletterSend.count({ where: { status: "SENT", sentAt: { gte: dayStart } } }),
  ]);
  return Math.max(0, dailyLimit - reminders - newsletters);
}
