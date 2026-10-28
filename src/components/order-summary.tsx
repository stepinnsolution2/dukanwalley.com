import { formatMoney, MARKETS, PAYMENT_METHOD_LABELS, type MarketCode, type MarketPaymentMethod } from "@/lib/markets";
import Link from "next/link";
import { ORDER_STATUS_LABELS, statusBadgeClass } from "@/lib/order-status";
import { ReviewForm, type ExistingReview } from "@/components/review-form";

export type BuyerOrder = {
  orderNumber: string;
  market: MarketCode;
  status: string;
  paymentMethod: string;
  createdAt: Date;
  total: { toString(): string };
  taxTotal: { toString(): string };
  shipping: { toString(): string };
  courier: string | null;
  trackingNumber: string | null;
  shippingAddress: unknown;
  items: {
    id: string;
    title: string;
    quantity: number;
    unitPrice: { toString(): string };
    product: { slug: string; name: string };
    review: ExistingReview;
  }[];
  events: { id: string; status: string; createdAt: Date }[];
};

/** What a buyer sees about their order: items, totals, delivery, and a status timeline (no staff notes). */
export function OrderSummary({
  order,
  reviewProof,
  reviewerName,
}: {
  order: BuyerOrder;
  /** Guests on Track order: the order number and contact they proved the order with. */
  reviewProof?: { orderNumber: string; contact: string };
  reviewerName?: string;
}) {
  const delivered = order.status === "DELIVERED";
  const m = MARKETS[order.market];
  const money = (v: { toString(): string } | number) => formatMoney(order.market, Number(v.toString()));
  const address = order.shippingAddress as Record<string, string> | null;
  // Collapse repeated statuses (e.g. overrides) for a clean timeline.
  const timeline = order.events.filter((e, i, all) => i === 0 || all[i - 1].status !== e.status);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-xl font-semibold">{order.orderNumber}</h1>
          <p className="text-sm text-zinc-600">
            Placed {order.createdAt.toISOString().slice(0, 10)} · {PAYMENT_METHOD_LABELS[order.paymentMethod as MarketPaymentMethod] ?? order.paymentMethod}
          </p>
        </div>
        <span className={statusBadgeClass(order.status)}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</span>
      </div>

      {order.courier ? (
        <p className="rounded-lg bg-violet-50 px-4 py-2 text-sm text-violet-900">
          Shipped with <strong>{order.courier}</strong>
          {order.trackingNumber ? (
            <>
              {" "}
              · tracking number <strong>{order.trackingNumber}</strong>
            </>
          ) : null}
        </p>
      ) : null}

      <ul className="divide-y rounded-xl border border-zinc-200 bg-white text-sm">
        {order.items.map((i) => (
          <li key={i.id} className="px-4 py-3">
            <div className="flex justify-between gap-3">
              <Link href={`/products/${i.product.slug}`} className="hover:text-teal-700">
                {i.title} × {i.quantity}
              </Link>
              <span>{money(Number(i.unitPrice.toString()) * i.quantity)}</span>
            </div>
            {delivered ? (
              <ReviewForm orderItemId={i.id} productName={i.product.name} existing={i.review} defaultName={reviewerName} proof={reviewProof} />
            ) : null}
          </li>
        ))}
        <li className="flex justify-between px-4 py-2 text-zinc-600">
          <span>Shipping</span>
          <span>{money(order.shipping)}</span>
        </li>
        <li className="flex justify-between px-4 py-3 font-semibold">
          <span>Total</span>
          <span>{money(order.total)}</span>
        </li>
        {Number(order.taxTotal.toString()) > 0 ? (
          <li className="px-4 pb-3 text-right text-xs text-zinc-500">
            Includes {money(order.taxTotal)} {m.taxName}
          </li>
        ) : null}
      </ul>

      {address ? (
        <p className="text-sm text-zinc-700">
          Delivering to {address.name}, {address.line1}
          {address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.region}
        </p>
      ) : null}

      <ol className="space-y-2 text-sm">
        {timeline.map((e) => (
          <li key={e.id} className="flex items-center gap-2">
            <span className={statusBadgeClass(e.status)}>{ORDER_STATUS_LABELS[e.status] ?? e.status}</span>
            <span className="text-zinc-500">{e.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Fields to load for OrderSummary. */
export const buyerOrderSelect = {
  orderNumber: true,
  market: true,
  status: true,
  paymentMethod: true,
  createdAt: true,
  total: true,
  taxTotal: true,
  shipping: true,
  courier: true,
  trackingNumber: true,
  shippingAddress: true,
  items: {
    select: {
      id: true,
      title: true,
      quantity: true,
      unitPrice: true,
      product: { select: { slug: true, name: true } },
      review: { select: { rating: true, title: true, body: true, authorName: true, status: true } },
    },
  },
  events: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
} as const;
