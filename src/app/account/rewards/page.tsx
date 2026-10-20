import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { formatMoney, MARKETS } from "@/lib/markets";
import { MAX_REDEEM_BPS, pointsValueMinor } from "@/lib/reward-rules";
import { getEarnBps } from "@/lib/rewards";
import { PAGE_NARROW } from "@/lib/page-layout";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  EARNED: "Earned — order delivered",
  REDEEMED: "Spent at checkout",
  REDEEM_REFUNDED: "Refunded — order cancelled or returned",
  EARN_REVERSED: "Reversed — order returned",
};

export default async function RewardsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/account/rewards");
  const [accounts, earnBps] = await Promise.all([
    prisma.rewardAccount.findMany({
      where: { userId: session.user.id },
      include: { entries: { orderBy: { createdAt: "desc" }, take: 50 } },
    }),
    getEarnBps(),
  ]);
  const orderNumbers = new Map(
    (
      await prisma.order.findMany({
        where: { id: { in: accounts.flatMap((a) => a.entries.map((e) => e.orderId!).filter(Boolean)) } },
        select: { id: true, orderNumber: true },
      })
    ).map((o) => [o.id, o.orderNumber]),
  );

  return (
    <>
      <SiteHeader />
      <main className={PAGE_NARROW}>
        <h1 className="text-2xl font-semibold">Reward points</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Earn {earnBps / 100}% of what you pay back as points when an order is delivered. Points can pay for up
          to {MAX_REDEEM_BPS / 100}% of an order at checkout.
        </p>

        {accounts.length === 0 ? (
          <p className="mt-6 text-zinc-600">
            No points yet.{" "}
            <Link href="/products" className="text-teal-700 underline">
              Start shopping
            </Link>{" "}
            to earn some.
          </p>
        ) : null}

        {accounts.map((a) => (
          <section key={a.id} className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{MARKETS[a.market].name} store</h2>
              <p className="text-2xl font-semibold text-amber-700">
                {a.balance} points{" "}
                <span className="text-sm font-normal text-zinc-500">
                  (worth {formatMoney(a.market, pointsValueMinor(a.market, a.balance) / 100)})
                </span>
              </p>
            </div>
            <ul className="mt-4 divide-y divide-zinc-100 text-sm">
              {a.entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p>{KIND_LABELS[e.kind] ?? e.kind}</p>
                    <p className="text-xs text-zinc-500">
                      {e.createdAt.toISOString().slice(0, 10)}
                      {e.orderId && orderNumbers.get(e.orderId) ? (
                        <>
                          {" · "}
                          <Link
                            href={`/account/orders/${encodeURIComponent(orderNumbers.get(e.orderId)!)}`}
                            className="font-mono text-teal-700 hover:underline"
                          >
                            {orderNumbers.get(e.orderId)}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <span className={e.points >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-zinc-700"}>
                    {e.points >= 0 ? "+" : ""}
                    {e.points}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
