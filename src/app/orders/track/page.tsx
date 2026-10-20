import type { Metadata } from "next";
import { buyerOrderSelect, OrderSummary } from "@/components/order-summary";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { MARKET_CODES, normalizeMobile } from "@/lib/markets";
import { PAGE_NARROW } from "@/lib/page-layout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Track your order", robots: { index: false } };

type Search = { order?: string; contact?: string };

/**
 * Order lookup for everyone, including guests: needs the order number AND the email or
 * mobile used at checkout, so an order number alone reveals nothing.
 */
export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const orderNumber = sp.order?.trim();
  const contact = sp.contact?.trim();

  let order = null;
  if (orderNumber && contact) {
    const phones = MARKET_CODES.map((m) => normalizeMobile(m, contact)).filter((p): p is string => !!p);
    order = await prisma.order.findFirst({
      where: {
        orderNumber,
        OR: [
          { customerEmail: { equals: contact, mode: "insensitive" } },
          ...(phones.length ? [{ customerPhone: { in: phones } }] : []),
        ],
      },
      select: buyerOrderSelect,
    });
  }

  return (
    <>
      <SiteHeader />
      <main className={PAGE_NARROW}>
        <h1 className="text-2xl font-semibold">Track your order</h1>
        <form method="get" className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input name="order" defaultValue={orderNumber} placeholder="Order number (ORD-…)" required className="flex-1 rounded-lg border px-3 py-2 text-sm" />
          <input name="contact" defaultValue={contact} placeholder="Email or mobile used at checkout" required className="flex-1 rounded-lg border px-3 py-2 text-sm" />
          <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Track</button>
        </form>
        {orderNumber && contact && !order ? (
          <p className="mt-4 text-sm text-red-600">We couldn&apos;t find an order with those details.</p>
        ) : null}
        {order ? (
          <div className="mt-6">
            <OrderSummary order={order} />
          </div>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
