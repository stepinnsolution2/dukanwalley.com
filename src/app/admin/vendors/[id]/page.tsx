import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatMoney, MARKETS } from "@/lib/markets";
import { toCents } from "@/lib/money";
import { ORDER_STATUS_LABELS, statusBadgeClass } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { LedgerAccountType, OrderStatus } from "@/generated/prisma/enums";
import { VendorControls } from "./vendor-controls";

export const dynamic = "force-dynamic";

/** Orders that count as sales for performance figures. */
const SOLD: OrderStatus[] = [OrderStatus.CONFIRMED, OrderStatus.PAID, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

type Props = { params: Promise<{ id: string }> };

export default async function AdminVendorPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const role = session?.user?.role;
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id },
    include: { user: { select: { email: true, name: true, createdAt: true } }, ledgerAccount: true },
  });
  if (!vendor) notFound();
  const m = MARKETS[vendor.market];

  const [productsByStatus, lines, recentOrders, wallet] = await Promise.all([
    prisma.product.groupBy({ by: ["approvalStatus"], where: { vendorId: id }, _count: { _all: true } }),
    prisma.orderItem.findMany({
      where: { vendorId: id },
      select: { unitPrice: true, quantity: true, commissionBpsApplied: true, order: { select: { id: true, status: true } } },
    }),
    prisma.order.findMany({
      where: { items: { some: { vendorId: id } } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, orderNumber: true, status: true, total: true, createdAt: true },
    }),
    vendor.ledgerAccount
      ? Promise.all([
          prisma.ledgerMovement.aggregate({ where: { toAccountId: vendor.ledgerAccount.id }, _sum: { amountCents: true } }),
          prisma.ledgerMovement.aggregate({ where: { fromAccountId: vendor.ledgerAccount.id }, _sum: { amountCents: true } }),
        ])
      : null,
  ]);

  const soldLines = lines.filter((l) => SOLD.includes(l.order.status));
  const salesCents = soldLines.reduce((s, l) => s + toCents(l.unitPrice) * l.quantity, 0);
  const commissionCents = soldLines.reduce((s, l) => s + Math.floor((toCents(l.unitPrice) * l.quantity * l.commissionBpsApplied) / 10000), 0);
  const orderIds = (statuses: OrderStatus[]) => new Set(lines.filter((l) => statuses.includes(l.order.status)).map((l) => l.order.id)).size;
  const walletCents = wallet ? (wallet[0]._sum.amountCents ?? 0) - (wallet[1]._sum.amountCents ?? 0) : 0;
  const count = (s: string) => productsByStatus.find((p) => p.approvalStatus === s)?._count._all ?? 0;

  const stat = (label: string, value: string | number, hint?: string) => (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        {vendor.logoUrl ? (
          <div className="relative h-16 w-16 overflow-hidden rounded-lg border">
            <Image src={vendor.logoUrl} alt="" fill unoptimized className="object-cover" sizes="64px" />
          </div>
        ) : null}
        <div>
          <Link href="/admin/vendors" className="text-sm text-teal-700 hover:underline">← Vendors</Link>
          <h1 className="text-2xl font-semibold">{vendor.storeName}</h1>
          <p className="text-sm text-zinc-600">
            {vendor.user.name} · {vendor.user.email} · {vendor.phone} · {m.name}
          </p>
          <p className="text-sm text-zinc-600">
            {vendor.addressLine1}, {vendor.city ?? ""} {vendor.region ?? ""} · joined {vendor.createdAt.toISOString().slice(0, 10)}
          </p>
        </div>
      </div>
      {vendor.restriction !== "NONE" ? (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          Restricted: {vendor.restriction.toLowerCase().replace("_", " ")}
          {vendor.suspendedReason ? ` — ${vendor.suspendedReason}` : ""}
        </p>
      ) : null}
      {vendor.kycStatus !== "APPROVED" ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          KYC {vendor.kycStatus.toLowerCase()} — this vendor&apos;s products are not sold until KYC is approved.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stat("Sales (incl. tax)", formatMoney(vendor.market, salesCents / 100), `${orderIds(SOLD)} orders`)}
        {stat("Platform commission", formatMoney(vendor.market, commissionCents / 100))}
        {stat("Wallet balance (ledger)", formatMoney(vendor.market, walletCents / 100))}
        {stat("Products", `${count("APPROVED")} approved`, `${count("PENDING_REVIEW")} pending · ${count("REJECTED")} rejected`)}
        {stat("Returned orders", orderIds([OrderStatus.RETURNED]))}
        {stat("Cancelled orders", orderIds([OrderStatus.CANCELLED]))}
        {stat("Complaints", vendor.complaintsCount)}
        {stat("Refunds", vendor.refundsCount)}
      </div>

      <VendorControls
        vendor={vendor}
        labels={m.idLabels}
        canManage={can(role, "vendors:manage")}
        canRestrict={can(role, "vendors:restrict")}
        canCommission={can(role, "vendors:commission")}
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Recent orders</h2>
          <Link href={`/admin/orders?vendor=${vendor.id}`} className="text-teal-700 hover:underline">All orders →</Link>
        </div>
        <ul className="mt-2 divide-y">
          {recentOrders.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-teal-800 hover:underline">{o.orderNumber}</Link>
              <span className={statusBadgeClass(o.status)}>{ORDER_STATUS_LABELS[o.status] ?? o.status}</span>
              <span>{formatMoney(vendor.market, o.total)}</span>
              <span className="text-xs text-zinc-500">{o.createdAt.toISOString().slice(0, 10)}</span>
            </li>
          ))}
        </ul>
        {recentOrders.length === 0 ? <p className="mt-2 text-zinc-500">No orders yet.</p> : null}
        <p className="mt-3 text-xs text-zinc-500">
          <Link href={`/admin/products?vendorId=${vendor.id}`} className="underline">Products</Link> · Ledger account {vendor.ledgerAccount ? LedgerAccountType.VENDOR_WALLET.toLowerCase() : "not created yet"}
        </p>
      </section>
    </div>
  );
}
