// DukanWalley's commission ("share") per order and per seller over a date range, for Admin ›
// Commission. Uses the rate captured on each order line when the order was placed, and the same
// formula as the ledger (src/lib/ledger.ts): commission is charged on the line's pre-tax amount.
import { prisma } from "@/lib/db";
import { isMarketCode, MARKETS, type MarketCode } from "@/lib/markets";
import { includedTaxCents, toCents } from "@/lib/money";
import { OrderStatus } from "@/generated/prisma/enums";

/** Which orders count. Default "earned": confirmed or later, not cancelled or returned. */
export const STATUS_GROUPS = {
  earned: {
    label: "Confirmed or later (excludes cancelled & returned)",
    statuses: [OrderStatus.CONFIRMED, OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.DISPUTED],
  },
  delivered: { label: "Delivered only", statuses: [OrderStatus.DELIVERED] },
  open: {
    label: "All active (also awaiting confirmation / payment)",
    statuses: [
      OrderStatus.PLACED,
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.CONFIRMED,
      OrderStatus.PAID,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.DISPUTED,
    ],
  },
  all: { label: "All orders (also cancelled & returned)", statuses: Object.values(OrderStatus) },
} as const;
export type StatusGroup = keyof typeof STATUS_GROUPS;

export const RANGES = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
  all: "All time",
  custom: "Custom dates",
} as const;
export type RangeKey = keyof typeof RANGES;

/** Local time in each market, for day boundaries (neither observes daylight saving). */
const UTC_OFFSET_HOURS: Record<MarketCode, number> = { PK: 5, AE: 4 };
export const TIME_ZONES: Record<MarketCode, string> = { PK: "Asia/Karachi", AE: "Asia/Dubai" };

export type ReportQuery = {
  market: MarketCode;
  range: RangeKey;
  /** yyyy-mm-dd, for range "custom". */
  from?: string;
  to?: string;
  vendorId?: string;
  status: StatusGroup;
};

export function parseReportQuery(sp: Record<string, string | undefined>): ReportQuery {
  const ymd = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  return {
    market: isMarketCode(sp.market) ? sp.market : "PK",
    range: sp.range && sp.range in RANGES ? (sp.range as RangeKey) : "this-month",
    from: ymd(sp.from),
    to: ymd(sp.to),
    vendorId: sp.vendor || undefined,
    status: sp.status && sp.status in STATUS_GROUPS ? (sp.status as StatusGroup) : "earned",
  };
}

/** [start, end) in UTC for the range, using the market's local days. */
export function rangeBounds(q: ReportQuery, now = new Date()): { start?: Date; end?: Date } {
  const offsetMs = UTC_OFFSET_HOURS[q.market] * 3600_000;
  // A local calendar date (y, m, d) at 00:00 local, as a UTC instant.
  const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - offsetMs);
  const local = new Date(now.getTime() + offsetMs);
  const [y, m, d] = [local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()];
  switch (q.range) {
    case "today":
      return { start: at(y, m, d), end: at(y, m, d + 1) };
    case "yesterday":
      return { start: at(y, m, d - 1), end: at(y, m, d) };
    case "7d":
      return { start: at(y, m, d - 6), end: at(y, m, d + 1) };
    case "30d":
      return { start: at(y, m, d - 29), end: at(y, m, d + 1) };
    case "this-month":
      return { start: at(y, m, 1), end: at(y, m + 1, 1) };
    case "last-month":
      return { start: at(y, m - 1, 1), end: at(y, m, 1) };
    case "this-year":
      return { start: at(y, 0, 1), end: at(y + 1, 0, 1) };
    case "custom": {
      const parse = (v?: string) => v?.split("-").map(Number) as [number, number, number] | undefined;
      const f = parse(q.from);
      const t = parse(q.to);
      return { start: f ? at(f[0], f[1] - 1, f[2]) : undefined, end: t ? at(t[0], t[1] - 1, t[2] + 1) : undefined };
    }
    default:
      return {};
  }
}

export type OrderShareRow = {
  orderId: string;
  orderNumber: string;
  createdAt: Date;
  status: OrderStatus;
  vendorId: string;
  vendorName: string;
  /** Shown to shoppers, when different from the real store name. */
  vendorPublicName: string | null;
  units: number;
  /** What the buyer paid for this seller's items (tax-inclusive). */
  salesCents: number;
  /** Rates on the lines; usually one. */
  rates: number[];
  commissionCents: number;
  /** Sales minus commission: what the seller is owed. */
  sellerCents: number;
};

export type VendorShareRow = {
  vendorId: string;
  vendorName: string;
  vendorPublicName: string | null;
  /** The store's own rate today (null: the platform default applies). */
  overrideBps: number | null;
  orders: number;
  units: number;
  salesCents: number;
  commissionCents: number;
  sellerCents: number;
};

export async function commissionReport(q: ReportQuery) {
  const { start, end } = rangeBounds(q);
  const items = await prisma.orderItem.findMany({
    where: {
      ...(q.vendorId ? { vendorId: q.vendorId } : {}),
      order: {
        market: q.market,
        status: { in: [...STATUS_GROUPS[q.status].statuses] },
        ...(start || end ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } } : {}),
      },
    },
    select: {
      quantity: true,
      unitPrice: true,
      taxBps: true,
      commissionBpsApplied: true,
      vendorId: true,
      vendor: { select: { storeName: true, displayName: true, commissionOverrideBps: true } },
      order: { select: { id: true, orderNumber: true, createdAt: true, status: true } },
    },
    orderBy: { order: { createdAt: "desc" } },
  });

  const byOrder = new Map<string, OrderShareRow>();
  const byVendor = new Map<string, VendorShareRow & { orderIds: Set<string> }>();
  for (const it of items) {
    const salesCents = toCents(it.unitPrice) * it.quantity;
    const preTax = salesCents - includedTaxCents(salesCents, it.taxBps, q.market);
    const commissionCents = Math.floor((preTax * it.commissionBpsApplied) / 10000);

    const key = `${it.order.id}:${it.vendorId}`;
    const o =
      byOrder.get(key) ??
      byOrder
        .set(key, {
          orderId: it.order.id,
          orderNumber: it.order.orderNumber,
          createdAt: it.order.createdAt,
          status: it.order.status,
          vendorId: it.vendorId,
          vendorName: it.vendor.storeName,
          vendorPublicName: it.vendor.displayName,
          units: 0,
          salesCents: 0,
          rates: [],
          commissionCents: 0,
          sellerCents: 0,
        })
        .get(key)!;
    o.units += it.quantity;
    o.salesCents += salesCents;
    o.commissionCents += commissionCents;
    o.sellerCents += salesCents - commissionCents;
    if (!o.rates.includes(it.commissionBpsApplied)) o.rates.push(it.commissionBpsApplied);

    const v =
      byVendor.get(it.vendorId) ??
      byVendor
        .set(it.vendorId, {
          vendorId: it.vendorId,
          vendorName: it.vendor.storeName,
          vendorPublicName: it.vendor.displayName,
          overrideBps: it.vendor.commissionOverrideBps,
          orders: 0,
          orderIds: new Set(),
          units: 0,
          salesCents: 0,
          commissionCents: 0,
          sellerCents: 0,
        })
        .get(it.vendorId)!;
    v.orderIds.add(it.order.id);
    v.units += it.quantity;
    v.salesCents += salesCents;
    v.commissionCents += commissionCents;
    v.sellerCents += salesCents - commissionCents;
  }

  const vendors = [...byVendor.values()]
    .map(({ orderIds, ...v }) => ({ ...v, orders: orderIds.size }))
    .sort((a, b) => b.commissionCents - a.commissionCents);
  const orders = [...byOrder.values()];
  const totals = {
    orders: new Set(orders.map((o) => o.orderId)).size,
    units: vendors.reduce((s, v) => s + v.units, 0),
    salesCents: vendors.reduce((s, v) => s + v.salesCents, 0),
    commissionCents: vendors.reduce((s, v) => s + v.commissionCents, 0),
    sellerCents: vendors.reduce((s, v) => s + v.sellerCents, 0),
  };
  return { start, end, currency: MARKETS[q.market].currency, totals, vendors, orders };
}
