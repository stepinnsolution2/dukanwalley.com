import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { buyerOrderSelect, OrderSummary } from "@/components/order-summary";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { PAGE_NARROW } from "@/lib/page-layout";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ orderNumber: string }> };

export default async function MyOrderPage({ params }: Props) {
  const { orderNumber } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/auth/login?next=/account/orders`);
  const order = await prisma.order.findFirst({
    where: { orderNumber: decodeURIComponent(orderNumber), customerId: session.user.id },
    select: buyerOrderSelect,
  });
  if (!order) notFound();

  return (
    <>
      <SiteHeader />
      <main className={PAGE_NARROW}>
        <Link href="/account/orders" className="text-sm text-teal-700 hover:underline">
          ← My orders
        </Link>
        <div className="mt-4">
          <OrderSummary order={order} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
