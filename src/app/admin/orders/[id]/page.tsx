import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatMoney, MARKETS, PAYMENT_METHOD_LABELS, type MarketPaymentMethod } from "@/lib/markets";
import { nextStatuses } from "@/lib/order-lifecycle";
import { ORDER_STATUS_LABELS, statusBadgeClass } from "@/lib/order-status";
import { can } from "@/lib/permissions";
import { OrderStatus, PaymentMethod } from "@/generated/prisma/enums";
import { CodActions } from "../cod-actions";
import { OrderActions } from "./order-actions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function AdminOrderPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const role = session?.user?.role;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { vendor: { select: { id: true, storeName: true } }, product: { select: { slug: true } } } },
      events: { orderBy: { createdAt: "asc" } },
      ledgerMovements: { orderBy: { createdAt: "asc" } },
      customer: { select: { email: true, name: true } },
    },
  });
  if (!order) notFound();

  // Resolve "staff:<id>" actors to names for the history.
  const staffIds = [...new Set(order.events.map((e) => e.actor).filter((a) => a.startsWith("staff:")).map((a) => a.slice(6)))];
  const staff = new Map(
    (await prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true } })).map((u) => [
      u.id,
      u.name ?? u.email,
    ]),
  );
  const actorName = (a: string) => (a.startsWith("staff:") ? `staff (${staff.get(a.slice(6)) ?? "unknown"})` : a);
  const money = (v: { toString(): string } | number) => formatMoney(order.market, v);
  const address = order.shippingAddress as Record<string, string> | null;
  const m = MARKETS[order.market];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/admin/orders" className="text-sm text-teal-700 hover:underline">
            ← Orders
          </Link>
          <h1 className="mt-1 font-mono text-xl font-semibold">{order.orderNumber}</h1>
          <p className="text-sm text-zinc-600">
            {m.name} · placed {order.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
          </p>
        </div>
        <span className={statusBadgeClass(order.status)}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm md:col-span-2">
          <h2 className="font-semibold">Items</h2>
          <table className="mt-2 w-full">
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="border-b border-zinc-100">
                  <td className="py-2">
                    <Link href={`/products/${i.product.slug}`} className="hover:underline">
                      {i.title}
                    </Link>
                    <span className="block text-xs text-zinc-500">
                      {i.vendor.storeName} · commission {i.commissionBpsApplied / 100}% · {m.taxName} {i.taxBps / 100}%
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {money(i.unitPrice)} × {i.quantity}
                  </td>
                  <td className="py-2 text-right">{money(Number(i.unitPrice) * i.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-right">
            <dt className="text-zinc-500">Excluding {m.taxName}</dt>
            <dd>{money(order.subtotal)}</dd>
            <dt className="text-zinc-500">{m.taxName} (included)</dt>
            <dd>{money(order.taxTotal)}</dd>
            <dt className="text-zinc-500">Shipping</dt>
            <dd>{money(order.shipping)}</dd>
            <dt className="font-semibold">Total</dt>
            <dd className="font-semibold">{money(order.total)}</dd>
          </dl>
        </section>

        <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <div>
            <h2 className="font-semibold">Buyer</h2>
            <p>{order.customer?.name ?? "Guest"}</p>
            <p>{order.customerEmail}</p>
            <p>{order.customerPhone}</p>
          </div>
          {address ? (
            <div>
              <h2 className="font-semibold">Deliver to</h2>
              <p>{address.name}</p>
              <p>{address.line1}</p>
              {address.line2 ? <p>{address.line2}</p> : null}
              <p>
                {address.city}, {address.region} {address.postalCode ?? ""}
              </p>
            </div>
          ) : null}
          {order.freeGift ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 sm:col-span-2">
              <h2 className="font-semibold">🎁 Free gift</h2>
              <p className="text-sm">This order reached the free-gift amount when it was placed. Put a gift in the parcel.</p>
            </div>
          ) : null}
          <div>
            <h2 className="font-semibold">Payment</h2>
            <p>
              {PAYMENT_METHOD_LABELS[order.paymentMethod as MarketPaymentMethod] ?? order.paymentMethod}
              {order.paymentProvider ? ` via ${order.paymentProvider}` : ""}
            </p>
            {order.paymentIntentId ? <p className="break-all text-xs text-zinc-500">Ref {order.paymentIntentId}</p> : null}
            {order.confirmedVia ? <p className="text-xs text-zinc-500">Confirmed by {order.confirmedVia === "customer" ? "buyer" : "staff"}</p> : null}
          </div>
          {order.courier ? (
            <div>
              <h2 className="font-semibold">Shipping</h2>
              <p>
                {order.courier}
                {order.trackingNumber ? ` · ${order.trackingNumber}` : ""}
              </p>
            </div>
          ) : null}
        </section>
      </div>

      {can(role, "orders:manage") ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 font-semibold">Actions</h2>
          {order.status === OrderStatus.PLACED ? (
            <div className="mb-3">
              <p className="mb-1 text-sm text-zinc-600">Waiting for the buyer to confirm this cash on delivery order:</p>
              <CodActions orderId={order.id} />
            </div>
          ) : null}
          <OrderActions
            orderId={order.id}
            next={nextStatuses(order)}
            canOverride={can(role, "orders:override")}
            allStatuses={Object.values(OrderStatus)}
            isCod={order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY}
          />
        </section>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">History</h2>
          <ol className="mt-2 space-y-2">
            {order.events.map((e) => (
              <li key={e.id} className="border-l-2 border-teal-600 pl-3">
                <span className={statusBadgeClass(e.status)}>{ORDER_STATUS_LABELS[e.status] ?? e.status}</span>{" "}
                <span className="text-xs text-zinc-500">
                  {e.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {actorName(e.actor)}
                </span>
                {e.note ? <p className="text-zinc-700">{e.note}</p> : null}
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <h2 className="font-semibold">Ledger</h2>
          {order.ledgerMovements.length === 0 ? (
            <p className="mt-2 text-zinc-500">Nothing booked yet (booked when paid or COD confirmed).</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {order.ledgerMovements.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span className={l.kind.startsWith("REVERSAL_") ? "text-red-700" : ""}>{l.kind.toLowerCase().replace(/_/g, " ")}</span>
                  <span>
                    {(l.amountCents / 100).toFixed(2)} {l.currency}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
