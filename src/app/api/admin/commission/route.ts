import { requirePermission } from "@/lib/authz";
import { commissionReport, parseReportQuery, TIME_ZONES } from "@/lib/commission-report";
import { fromCents } from "@/lib/money";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

/** Admin › Commission as CSV: one row per order and seller, same filters as the page. */
export async function GET(req: Request) {
  const authz = await requirePermission("finance:view");
  if (!authz.ok) return authz.response;
  const q = parseReportQuery(Object.fromEntries(new URL(req.url).searchParams));
  const report = await commissionReport(q);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONES[q.market] }); // yyyy-mm-dd
  const cell = (v: string | number | { toString(): string }) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = [
    ["Order", "Date", "Status", "Seller", "Shown as", "Items", `Amount (${report.currency})`, "Rate %", `Commission (${report.currency})`, `Owed to seller (${report.currency})`],
    ...report.orders.map((o) => [
      o.orderNumber,
      date.format(o.createdAt),
      ORDER_STATUS_LABELS[o.status] ?? o.status,
      o.vendorName,
      o.vendorPublicName ?? "",
      o.units,
      fromCents(o.salesCents),
      o.rates.map((r) => r / 100).join(" / "),
      fromCents(o.commissionCents),
      fromCents(o.sellerCents),
    ]),
    ["Total", "", "", "", "", report.totals.units, fromCents(report.totals.salesCents), "", fromCents(report.totals.commissionCents), fromCents(report.totals.sellerCents)],
  ];
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commission-${q.market}-${q.range}-${date.format(new Date())}.csv"`,
    },
  });
}
