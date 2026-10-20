import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { formatMoney, MARKETS } from "@/lib/markets";
import { hashConfirmToken } from "@/lib/orders";
import { OrderStatus } from "@/generated/prisma/enums";
import { PAGE_FORM } from "@/lib/page-layout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm your order", robots: { index: false } };

type Props = { params: Promise<{ token: string }> };

/**
 * Landing page for the WhatsApp/SMS/email confirmation link. Viewing never changes the
 * order (link previews fetch it automatically); the buttons POST to /api/orders/confirm.
 */
export default async function ConfirmOrderPage({ params }: Props) {
  const { token } = await params;
  const order = await prisma.order.findUnique({
    where: { confirmTokenHash: hashConfirmToken(token) },
    include: { items: true },
  });

  const shell = (children: React.ReactNode) => (
    <>
      <SiteHeader />
      <main className={PAGE_FORM}>{children}</main>
      <SiteFooter />
    </>
  );

  if (!order) {
    return shell(
      <p className="text-zinc-700">This confirmation link isn&apos;t valid. Please use the latest link we sent you.</p>,
    );
  }

  const address = order.shippingAddress as Record<string, string> | null;
  const expired = !order.confirmTokenExpiresAt || order.confirmTokenExpiresAt < new Date();
  const canAnswer = order.status === OrderStatus.PLACED && !expired;

  return shell(
    <>
      <h1 className="text-2xl font-semibold">Order {order.orderNumber}</h1>
      <p className="mt-1 text-sm text-zinc-600">Cash on delivery · {MARKETS[order.market].name}</p>
      <ul className="mt-6 divide-y rounded-xl border border-zinc-200 bg-white text-sm">
        {order.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-3 px-4 py-3">
            <span>
              {i.title} × {i.quantity}
            </span>
            <span>{formatMoney(order.market, Number(i.unitPrice) * i.quantity)}</span>
          </li>
        ))}
        <li className="flex justify-between px-4 py-3 font-semibold">
          <span>Total to pay on delivery</span>
          <span>{formatMoney(order.market, order.total)}</span>
        </li>
      </ul>
      {address ? (
        <p className="mt-4 text-sm text-zinc-600">
          Deliver to {address.name}, {address.line1}, {address.city}, {address.region}
        </p>
      ) : null}

      {canAnswer ? (
        <form action="/api/orders/confirm" method="post" className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            name="action"
            value="confirm"
            className="flex-1 rounded-lg bg-teal-700 py-3 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Yes, confirm my order
          </button>
          <button
            type="submit"
            name="action"
            value="cancel"
            className="flex-1 rounded-lg border border-zinc-300 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Cancel order
          </button>
        </form>
      ) : (
        <p className="mt-8 rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-800">
          {order.status === OrderStatus.CONFIRMED
            ? "Thanks — your order is confirmed. We'll let you know when it ships."
            : order.status === OrderStatus.CANCELLED
              ? "This order has been cancelled."
              : order.status === OrderStatus.PLACED
                ? "This confirmation link has expired."
                : `This order is ${order.status.toLowerCase()}.`}
        </p>
      )}
    </>,
  );
}
