// A vendor's account with DukanWalley: what they've earned (delivered orders less commission),
// what we've paid them, what is due, and the thread of payments and messages between us.
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { commissionReport } from "@/lib/commission-report";
import { formatMoney, type MarketCode } from "@/lib/markets";
import { toCents } from "@/lib/money";
import type { PrivateFile } from "@/lib/private-files";
import { SITE_URL } from "@/lib/seo";
import { publicStoreName } from "@/lib/vendor-slug";

export type AccountSummary = {
  currency: string;
  /** Delivered orders, after commission: what the vendor has earned. */
  earnedCents: number;
  /** Payments recorded (not voided). */
  paidCents: number;
  /** earned − paid; negative means paid in advance. */
  dueCents: number;
  /** Confirmed, paid online, processing, shipped or disputed: becomes earned once delivered. */
  inProgressCents: number;
  deliveredOrders: number;
  inProgressOrders: number;
};

/** Balances for some vendors (all of them when no ids), keyed by vendor id. */
export async function accountSummaries(market: MarketCode, vendorIds?: string[]): Promise<Map<string, AccountSummary>> {
  const base = { market, range: "all" as const };
  const [delivered, active, payments] = await Promise.all([
    commissionReport({ ...base, status: "delivered" }),
    commissionReport({ ...base, status: "earned" }),
    prisma.vendorAccountEntry.groupBy({
      by: ["vendorId"],
      where: { kind: "PAYMENT", voidedAt: null, vendor: { market }, ...(vendorIds ? { vendorId: { in: vendorIds } } : {}) },
      _sum: { amount: true },
    }),
  ]);
  const paid = new Map(payments.map((p) => [p.vendorId, toCents(Number(p._sum.amount ?? 0))]));
  const ids = vendorIds ?? [...new Set([...delivered.vendors.map((v) => v.vendorId), ...active.vendors.map((v) => v.vendorId), ...paid.keys()])];
  const out = new Map<string, AccountSummary>();
  for (const id of ids) {
    const d = delivered.vendors.find((v) => v.vendorId === id);
    const a = active.vendors.find((v) => v.vendorId === id);
    const earnedCents = d?.sellerCents ?? 0;
    const paidCents = paid.get(id) ?? 0;
    out.set(id, {
      currency: delivered.currency,
      earnedCents,
      paidCents,
      dueCents: earnedCents - paidCents,
      inProgressCents: (a?.sellerCents ?? 0) - earnedCents,
      deliveredOrders: d?.orders ?? 0,
      inProgressOrders: (a?.orders ?? 0) - (d?.orders ?? 0),
    });
  }
  return out;
}

export async function accountSummary(vendorId: string) {
  const v = await prisma.vendorProfile.findUniqueOrThrow({ where: { id: vendorId }, select: { market: true } });
  return (await accountSummaries(v.market, [vendorId])).get(vendorId)!;
}

export function threadEntries(vendorId: string) {
  return prisma.vendorAccountEntry.findMany({ where: { vendorId }, orderBy: { createdAt: "asc" } });
}
export type ThreadEntry = Awaited<ReturnType<typeof threadEntries>>[number];

/** Entries the other side wrote since this side last opened the thread. */
export async function unreadCount(vendorId: string, viewer: "ADMIN" | "VENDOR") {
  const v = await prisma.vendorProfile.findUnique({ where: { id: vendorId }, select: { accountSeenByAdminAt: true, accountSeenByVendorAt: true } });
  const seen = viewer === "ADMIN" ? v?.accountSeenByAdminAt : v?.accountSeenByVendorAt;
  return prisma.vendorAccountEntry.count({
    where: { vendorId, side: viewer === "ADMIN" ? "VENDOR" : "ADMIN", ...(seen ? { createdAt: { gt: seen } } : {}) },
  });
}

export async function markSeen(vendorId: string, viewer: "ADMIN" | "VENDOR") {
  await prisma.vendorProfile.update({
    where: { id: vendorId },
    data: viewer === "ADMIN" ? { accountSeenByAdminAt: new Date() } : { accountSeenByVendorAt: new Date() },
  });
}

export type NewEntry = {
  vendorId: string;
  side: "ADMIN" | "VENDOR";
  author: { id: string; name: string };
  kind: "PAYMENT" | "MESSAGE";
  body: string;
  amount?: number;
  method?: string;
  reference?: string;
  paidOn?: Date;
  attachments: PrivateFile[];
};

export async function addEntry(e: NewEntry) {
  const entry = await prisma.vendorAccountEntry.create({
    data: {
      vendorId: e.vendorId,
      side: e.side,
      kind: e.kind,
      authorId: e.author.id,
      authorName: e.author.name,
      body: e.body,
      amount: e.kind === "PAYMENT" ? e.amount : null,
      method: e.kind === "PAYMENT" ? e.method || null : null,
      reference: e.kind === "PAYMENT" ? e.reference || null : null,
      paidOn: e.kind === "PAYMENT" ? (e.paidOn ?? new Date()) : null,
      attachments: e.attachments,
    },
  });
  // The writer has obviously seen the thread.
  await markSeen(e.vendorId, e.side);
  await notifyOtherSide(entry.id).catch((err) => console.error("[vendor-account] notify failed", err));
  return entry;
}

/** Emails the vendor about a new payment/message from us, or the company about a vendor message. */
async function notifyOtherSide(entryId: string) {
  const e = await prisma.vendorAccountEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { vendor: { select: { id: true, storeName: true, displayName: true, market: true, user: { select: { email: true } } } } },
  });
  const money = e.amount != null ? formatMoney(e.vendor.market, e.amount) : null;
  const files = (e.attachments as PrivateFile[]).length;
  if (e.side === "ADMIN") {
    const subject = e.kind === "PAYMENT" ? `Payment of ${money} sent to you` : "New message from DukanWalley";
    await sendEmail({
      to: e.vendor.user.email,
      subject,
      content: {
        heading: e.kind === "PAYMENT" ? `We've sent you ${money}` : "You have a new message",
        paragraphs: [
          `Hi ${publicStoreName(e.vendor)},`,
          e.kind === "PAYMENT"
            ? `DukanWalley has recorded a payment of ${money}${e.method ? ` by ${e.method}` : ""}${e.reference ? ` (reference ${e.reference})` : ""}.`
            : "DukanWalley has sent you a message about your account.",
          ...(e.body ? [`"${e.body.slice(0, 500)}"`] : []),
          ...(files ? [`${files} file${files > 1 ? "s" : ""} attached.`] : []),
          e.kind === "PAYMENT" ? "Please open your account to confirm you received it, or reply if anything is wrong." : "",
        ].filter(Boolean),
        button: { label: "Open my account", url: `${SITE_URL}/vendor/payments` },
        reason: "You're receiving this because you sell on DukanWalley.",
      },
    });
  } else {
    const to = process.env.COMPANY_NOTIFY_EMAIL;
    if (!to) return;
    await sendEmail({
      to,
      subject: `Message from ${e.vendor.storeName}`,
      content: {
        heading: `${e.vendor.storeName} wrote about their account`,
        paragraphs: [...(e.body ? [e.body.slice(0, 1000)] : []), ...(files ? [`${files} file${files > 1 ? "s" : ""} attached.`] : [])],
        button: { label: "Open the account", url: `${SITE_URL}/admin/payouts/${e.vendor.id}` },
      },
    });
  }
}
