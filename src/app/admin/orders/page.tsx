import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatMoney, isMarketCode, MARKET_CODES, MARKETS, PAYMENT_METHOD_LABELS, type MarketPaymentMethod } from "@/lib/markets";
import { ORDER_STATUS_LABELS, statusBadgeClass } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { OrderStatus, PaymentMethod } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { CodActions } from "./cod-actions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Search = {
  status?: string;
  market?: string;
  payment?: string;
  vendor?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
};

/** Parses a yyyy-mm-dd filter as a UTC day boundary. */
function day(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}Z`);
}

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const session = await auth();
  const canManage = can(session?.user?.role, "orders:manage");
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const from = day(sp.from);
  const to = day(sp.to, true);

  const where: Prisma.OrderWhereInput = {
    ...(sp.status && sp.status in OrderStatus ? { status: sp.status as OrderStatus } : {}),
    ...(isMarketCode(sp.market) ? { market: sp.market } : {}),
    ...(sp.payment && sp.payment in PaymentMethod ? { paymentMethod: sp.payment as PaymentMethod } : {}),
    ...(sp.vendor ? { items: { some: { vendorId: sp.vendor } } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { customerEmail: { contains: q, mode: "insensitive" } },
            { customerPhone: { contains: q.replace(/[\s-]/g, "") } },
          ],
        }
      : {}),
  };

  const [orders, total, vendors, flagged] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { items: { select: { quantity: true, vendor: { select: { storeName: true } } } } },
    }),
    prisma.order.count({ where }),
    prisma.vendorProfile.findMany({ select: { id: true, storeName: true, market: true }, orderBy: { storeName: "asc" } }),
    prisma.riskFlag.groupBy({
      by: ["kind"],
      where: { kind: { in: ["PAID_AFTER_CANCEL", "REFUND_NEEDED"] }, resolved: false },
      _count: { _all: true },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (p: number) => `?${new URLSearchParams({ ...(sp as Record<string, string>), page: String(p) })}`;
  const field = "rounded border px-2 py-1.5 text-sm";

  return (
    <div>
      <h1 className="text-2xl font-semibold">Orders</h1>
      {flagged.map((f) => (
        <p key={f.kind} className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          {f._count._all} order(s) need a refund (
          {f.kind === "PAID_AFTER_CANCEL" ? "paid after cancellation" : "prepaid order returned"}).
        </p>
      ))}

      <form className="mt-4 flex flex-wrap gap-2" method="get">
        <input name="q" defaultValue={q} placeholder="Order no, email or phone" className={field} />
        <select name="status" defaultValue={sp.status ?? ""} className={field}>
          <option value="">Any status</option>
          {Object.values(OrderStatus).map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </select>
        <select name="market" defaultValue={sp.market ?? ""} className={field}>
          <option value="">All countries</option>
          {MARKET_CODES.map((c) => (
            <option key={c} value={c}>
              {MARKETS[c].name}
            </option>
          ))}
        </select>
        <select name="payment" defaultValue={sp.payment ?? ""} className={field}>
          <option value="">Any payment</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {k === "STRIPE" ? "Card (Stripe)" : k === "CARD" ? "Card (PK)" : v}
            </option>
          ))}
        </select>
        <select name="vendor" defaultValue={sp.vendor ?? ""} className={field}>
          <option value="">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.storeName} ({v.market})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          From <input type="date" name="from" defaultValue={sp.from} className={field} />
        </label>
        <label className="flex items-center gap-1 text-sm">
          To <input type="date" name="to" defaultValue={sp.to} className={field} />
        </label>
        <button className="rounded bg-teal-700 px-3 py-1.5 text-sm text-white">Filter</button>
        <Link href="/admin/orders" className="px-2 py-1.5 text-sm text-zinc-600 underline">
          Clear
        </Link>
      </form>

      <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Vendors</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-zinc-100 align-top">
                <td className="px-4 py-3">
                  <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-teal-800 hover:underline">
                    {o.orderNumber}
                  </Link>
                  <span className="block text-xs text-zinc-500">
                    {o.market} · {o.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                  </span>
                </td>
                <td className="px-4 py-3">
                  {o.customerEmail}
                  {o.customerPhone ? <span className="block text-xs text-zinc-500">{o.customerPhone}</span> : null}
                </td>
                <td className="px-4 py-3 text-xs">{[...new Set(o.items.map((i) => i.vendor.storeName))].join(", ")}</td>
                <td className="px-4 py-3">{formatMoney(o.market, o.total)}</td>
                <td className="px-4 py-3">
                  <span className={statusBadgeClass(o.status)}>{ORDER_STATUS_LABELS[o.status] ?? o.status}</span>
                  {canManage && o.status === OrderStatus.PLACED ? (
                    <div className="mt-2">
                      <CodActions orderId={o.id} />
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {PAYMENT_METHOD_LABELS[o.paymentMethod as MarketPaymentMethod] ?? o.paymentMethod}
                  {o.paymentProvider ? <span className="block text-xs text-zinc-500">{o.paymentProvider}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orders.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No orders match.</p> : null}
      <div className="mt-4 flex items-center gap-3 text-sm">
        {page > 1 ? <Link href={pageLink(page - 1)} className="underline">Previous</Link> : null}
        <span>
          Page {page} of {pages} · {total} orders
        </span>
        {page < pages ? <Link href={pageLink(page + 1)} className="underline">Next</Link> : null}
      </div>
    </div>
  );
}
