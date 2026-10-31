import Link from "next/link";
import { prisma } from "@/lib/db";
import { platformDefaultCommissionBps } from "@/lib/commission";
import {
  commissionReport,
  parseReportQuery,
  RANGES,
  STATUS_GROUPS,
  TIME_ZONES,
  type ReportQuery,
} from "@/lib/commission-report";
import { formatMoney, MARKET_CODES, MARKETS } from "@/lib/markets";
import { fromCents } from "@/lib/money";
import { ORDER_STATUS_LABELS, statusBadgeClass } from "@/lib/order-status";

export const dynamic = "force-dynamic";

/** Order rows shown on the page; the CSV download has them all. */
const MAX_ORDER_ROWS = 300;

export default async function AdminCommissionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = parseReportQuery(sp);
  const [report, vendors, defaultBps] = await Promise.all([
    commissionReport(q),
    prisma.vendorProfile.findMany({
      where: { market: q.market },
      select: { id: true, storeName: true, displayName: true, commissionOverrideBps: true },
      orderBy: { storeName: "asc" },
    }),
    platformDefaultCommissionBps(),
  ]);
  const money = (cents: number) => formatMoney(q.market, fromCents(cents));
  const pct = (bps: number) => `${bps / 100}%`;
  const qs = (patch: Partial<Record<keyof ReportQuery | "vendor", string | undefined>>) => {
    const base: Record<string, string | undefined> = {
      market: q.market,
      range: q.range,
      from: q.range === "custom" ? q.from : undefined,
      to: q.range === "custom" ? q.to : undefined,
      vendor: q.vendorId,
      status: q.status,
      ...patch,
    };
    return new URLSearchParams(Object.entries(base).filter((e): e is [string, string] => !!e[1])).toString();
  };
  const shownVendor = vendors.find((v) => v.id === q.vendorId);
  const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONES[q.market] });
  const period =
    report.start || report.end
      ? `${report.start ? dayFmt.format(report.start) : "the start"} – ${report.end ? dayFmt.format(new Date(report.end.getTime() - 1)) : "today"}`
      : "all time";
  const input = "rounded border border-zinc-300 px-2 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Commission</h1>
        <p className="text-sm text-zinc-600">
          DukanWalley&apos;s share of each order and what each seller is owed. Each order uses the rate in force when it was placed;
          commission is charged on the item amount before any sales tax. The default rate is {pct(defaultBps)}; change a store&apos;s
          rate in Vendors › the store › Commission override.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Period</span>
          <select name="range" defaultValue={q.range} className={input}>
            {Object.entries(RANGES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">From (custom)</span>
          <input type="date" name="from" defaultValue={q.from} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">To (custom)</span>
          <input type="date" name="to" defaultValue={q.to} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Seller</span>
          <select name="vendor" defaultValue={q.vendorId ?? ""} className={input}>
            <option value="">All sellers</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.storeName}
                {v.displayName && v.displayName !== v.storeName ? ` (shown as ${v.displayName})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Orders counted</span>
          <select name="status" defaultValue={q.status} className={input}>
            {Object.entries(STATUS_GROUPS).map(([k, g]) => (
              <option key={k} value={k}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Market</span>
          <select name="market" defaultValue={q.market} className={input}>
            {MARKET_CODES.map((c) => (
              <option key={c} value={c}>
                {MARKETS[c].name} ({MARKETS[c].currency})
              </option>
            ))}
          </select>
        </label>
        <button className="rounded bg-teal-700 px-4 py-1.5 font-medium text-white">Show</button>
        <a href={`/api/admin/commission?${qs({})}`} className="rounded border border-teal-700 px-3 py-1.5 font-medium text-teal-800">
          Download CSV
        </a>
      </form>

      <p className="text-sm text-zinc-600">
        {RANGES[q.range]} · {period}
        {shownVendor ? ` · ${shownVendor.storeName}` : ""} · {STATUS_GROUPS[q.status].label.toLowerCase()}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Orders", String(report.totals.orders)],
          ["Sales", money(report.totals.salesCents)],
          ["DukanWalley commission", money(report.totals.commissionCents)],
          ["Owed to sellers", money(report.totals.sellerCents)],
        ].map(([label, value], i) => (
          <div key={label} className={`rounded-xl border p-4 ${i === 2 ? "border-teal-300 bg-teal-50" : "border-zinc-200 bg-white"}`}>
            <p className="text-xs text-zinc-500">{label}</p>
            <p className={`mt-1 text-xl font-semibold ${i === 2 ? "text-teal-900" : "text-zinc-900"}`}>{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">By seller</h2>
        {report.vendors.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">Seller</th>
                  <th className="py-2 pr-4">Rate now</th>
                  <th className="py-2 pr-4 text-right">Orders</th>
                  <th className="py-2 pr-4 text-right">Items</th>
                  <th className="py-2 pr-4 text-right">Sales</th>
                  <th className="py-2 pr-4 text-right">Commission</th>
                  <th className="py-2 pr-4 text-right">Owed to seller</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {report.vendors.map((v) => (
                  <tr key={v.vendorId}>
                    <td className="py-2 pr-4">
                      <Link href={`/admin/commission?${qs({ vendor: v.vendorId })}`} className="font-medium text-teal-800 hover:underline">
                        {v.vendorName}
                      </Link>
                      {v.vendorPublicName && v.vendorPublicName !== v.vendorName ? (
                        <span className="block text-xs text-zinc-500">shown as {v.vendorPublicName}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4">{v.overrideBps != null ? pct(v.overrideBps) : `${pct(defaultBps)} (default)`}</td>
                    <td className="py-2 pr-4 text-right">{v.orders}</td>
                    <td className="py-2 pr-4 text-right">{v.units}</td>
                    <td className="py-2 pr-4 text-right">{money(v.salesCents)}</td>
                    <td className="py-2 pr-4 text-right font-semibold text-teal-900">{money(v.commissionCents)}</td>
                    <td className="py-2 pr-4 text-right">{money(v.sellerCents)}</td>
                  </tr>
                ))}
              </tbody>
              {report.vendors.length > 1 ? (
                <tfoot className="border-t border-zinc-300 font-semibold">
                  <tr>
                    <td className="py-2 pr-4">Total</td>
                    <td />
                    <td className="py-2 pr-4 text-right">{report.totals.orders}</td>
                    <td className="py-2 pr-4 text-right">{report.totals.units}</td>
                    <td className="py-2 pr-4 text-right">{money(report.totals.salesCents)}</td>
                    <td className="py-2 pr-4 text-right text-teal-900">{money(report.totals.commissionCents)}</td>
                    <td className="py-2 pr-4 text-right">{money(report.totals.sellerCents)}</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No orders in this period.</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">By order</h2>
        <p className="text-xs text-zinc-500">An order with items from two sellers shows one row per seller.</p>
        {report.orders.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Seller</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4 text-right">Rate</th>
                  <th className="py-2 pr-4 text-right">Commission</th>
                  <th className="py-2 pr-4 text-right">Owed to seller</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {report.orders.slice(0, MAX_ORDER_ROWS).map((o) => (
                  <tr key={`${o.orderId}:${o.vendorId}`}>
                    <td className="py-2 pr-4">
                      <Link href={`/admin/orders/${o.orderId}`} className="text-teal-800 hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4">{dayFmt.format(o.createdAt)}</td>
                    <td className="py-2 pr-4">
                      <span className={statusBadgeClass(o.status)}>{ORDER_STATUS_LABELS[o.status] ?? o.status}</span>
                    </td>
                    <td className="py-2 pr-4">{o.vendorName}</td>
                    <td className="py-2 pr-4 text-right">{money(o.salesCents)}</td>
                    <td className="py-2 pr-4 text-right">{o.rates.map(pct).join(" / ")}</td>
                    <td className="py-2 pr-4 text-right font-semibold text-teal-900">{money(o.commissionCents)}</td>
                    <td className="py-2 pr-4 text-right">{money(o.sellerCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.orders.length > MAX_ORDER_ROWS ? (
              <p className="mt-2 text-xs text-zinc-500">
                Showing the latest {MAX_ORDER_ROWS} of {report.orders.length}. Download the CSV for all of them.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No orders in this period.</p>
        )}
      </section>
    </div>
  );
}
