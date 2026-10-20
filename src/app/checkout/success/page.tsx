import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/markets";
import { COD_CONFIRM_TTL_HOURS } from "@/lib/orders";
import { OrderStatus } from "@/generated/prisma/enums";
import { PAGE_FORM } from "@/lib/page-layout";

export const dynamic = "force-dynamic";

const messages: Partial<Record<OrderStatus, { title: string; body: string; tone: string }>> = {
  PLACED: {
    title: "Please confirm your order",
    body: `We've sent a confirmation link by WhatsApp or SMS and email. Tap it to confirm — unconfirmed cash on delivery orders are cancelled after ${COD_CONFIRM_TTL_HOURS} hours.`,
    tone: "text-teal-800",
  },
  PENDING_PAYMENT: {
    title: "Waiting for payment confirmation",
    body: "If you approved the payment in your wallet app, this page updates automatically.",
    tone: "text-amber-700",
  },
  PAID: { title: "Payment received", body: "Thanks! A confirmation is on its way.", tone: "text-green-800" },
  CONFIRMED: { title: "Order confirmed", body: "Thanks! We'll let you know when it ships.", tone: "text-green-800" },
  CANCELLED: {
    title: "Order cancelled",
    body: "The payment wasn't completed, so nothing was charged. Your cart is still available.",
    tone: "text-red-700",
  },
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const sp = await searchParams;
  // Only the status is shown, never personal details: order numbers aren't secrets.
  const order = sp.order
    ? await prisma.order.findUnique({
        where: { orderNumber: sp.order },
        select: { orderNumber: true, status: true, market: true, total: true },
      })
    : null;
  const msg = order ? messages[order.status] : undefined;
  const waiting = order?.status === OrderStatus.PENDING_PAYMENT;

  return (
    <main className={`${PAGE_FORM} text-center`}>
      {waiting ? <meta httpEquiv="refresh" content="8" /> : null}
      <h1 className={`text-2xl font-semibold ${msg?.tone ?? "text-green-800"}`}>
        {msg?.title ?? "Order placed"}
      </h1>
      {order ? (
        <p className="mt-4 text-zinc-700">
          Reference: <strong>{order.orderNumber}</strong> · {formatMoney(order.market, order.total)}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-zinc-600">{msg?.body ?? "Thanks for your order."}</p>
      <Link
        href={order?.status === OrderStatus.CANCELLED ? "/cart" : "/"}
        className="mt-8 inline-block text-teal-700 hover:underline"
      >
        {order?.status === OrderStatus.CANCELLED ? "Back to cart" : "Continue shopping"}
      </Link>
    </main>
  );
}
