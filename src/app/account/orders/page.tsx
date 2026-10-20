import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/markets";
import { ORDER_STATUS_LABELS, statusBadgeClass } from "@/lib/order-status";
import { PAGE_NARROW } from "@/lib/page-layout";

export const dynamic = "force-dynamic";

export default async function MyOrdersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/account/orders");
  const orders = await prisma.order.findMany({
    where: { customerId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { items: { select: { title: true, quantity: true } } },
  });

  return (
    <>
      <SiteHeader />
      <main className={PAGE_NARROW}>
        <h1 className="text-2xl font-semibold">My orders</h1>
        <ul className="mt-4 space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/account/orders/${encodeURIComponent(o.orderNumber)}`}
                className="block rounded-xl border border-zinc-200 bg-white p-4 hover:border-teal-300"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm">{o.orderNumber}</span>
                  <span className={statusBadgeClass(o.status)}>{ORDER_STATUS_LABELS[o.status] ?? o.status}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-600">
                  {o.items.map((i) => `${i.title} × ${i.quantity}`).join(", ")}
                </p>
                <p className="mt-1 text-sm">
                  {formatMoney(o.market, o.total)} · {o.createdAt.toISOString().slice(0, 10)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
        {orders.length === 0 ? (
          <p className="mt-6 text-zinc-600">
            No orders yet. <Link href="/products" className="text-teal-700 underline">Start shopping</Link>
          </p>
        ) : null}
        <p className="mt-6 text-sm text-zinc-500">
          Ordered as a guest? <Link href="/orders/track" className="text-teal-700 underline">Track it here</Link>.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
