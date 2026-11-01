import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatMoney, isMarketCode, MARKET_CODES, MARKETS } from "@/lib/markets";
import { accountSummaries } from "@/lib/vendor-account";

export const dynamic = "force-dynamic";

/** Every vendor's balance: earned on delivered orders, paid, due, in progress, unread messages. */
export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ market?: string; show?: string }> }) {
  const sp = await searchParams;
  const market = isMarketCode(sp.market) ? sp.market : "PK";
  const showAll = sp.show === "all";
  const [vendors, summaries] = await Promise.all([
    prisma.vendorProfile.findMany({
      where: { market },
      select: { id: true, storeName: true, displayName: true, phone: true, accountSeenByAdminAt: true },
      orderBy: { storeName: "asc" },
    }),
    accountSummaries(market),
  ]);
  const unread = new Map(
    await Promise.all(
      vendors.map(async (v) => {
        const n = await prisma.vendorAccountEntry.count({
          where: { vendorId: v.id, side: "VENDOR", ...(v.accountSeenByAdminAt ? { createdAt: { gt: v.accountSeenByAdminAt } } : {}) },
        });
        return [v.id, n] as const;
      }),
    ),
  );
  const zero = { earnedCents: 0, paidCents: 0, dueCents: 0, inProgressCents: 0, deliveredOrders: 0, inProgressOrders: 0, currency: MARKETS[market].currency };
  const rows = vendors
    .map((v) => ({ v, s: summaries.get(v.id) ?? zero, unread: unread.get(v.id) ?? 0 }))
    .filter((r) => showAll || r.s.earnedCents || r.s.paidCents || r.s.inProgressCents || r.unread)
    .sort((a, b) => b.unread - a.unread || b.s.dueCents - a.s.dueCents);
  const total = rows.reduce(
    (t, r) => ({ earned: t.earned + r.s.earnedCents, paid: t.paid + r.s.paidCents, due: t.due + Math.max(0, r.s.dueCents), progress: t.progress + r.s.inProgressCents }),
    { earned: 0, paid: 0, due: 0, progress: 0 },
  );
  const m = (c: number) => formatMoney(market, c / 100);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vendor payments</h1>
          <p className="text-sm text-zinc-600">
            What each seller has earned on delivered orders (after DukanWalley&apos;s commission), what you&apos;ve paid them, and what is still due.
            Open a seller to record a payment with screenshots, or message them.
          </p>
        </div>
        <form className="flex gap-2 text-sm">
          <select name="market" defaultValue={market} className="rounded border border-zinc-300 px-2 py-1.5">
            {MARKET_CODES.map((c) => (
              <option key={c} value={c}>
                {MARKETS[c].name}
              </option>
            ))}
          </select>
          <select name="show" defaultValue={showAll ? "all" : ""} className="rounded border border-zinc-300 px-2 py-1.5">
            <option value="">Sellers with activity</option>
            <option value="all">All sellers</option>
          </select>
          <button className="rounded bg-teal-700 px-3 py-1.5 font-medium text-white">Show</button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Earned by sellers", m(total.earned)],
          ["Paid to sellers", m(total.paid)],
          ["Still due", m(total.due)],
          ["In progress", m(total.progress)],
        ].map(([k, v], i) => (
          <div key={k} className={`rounded-xl border p-4 ${i === 2 ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-white"}`}>
            <p className="text-xs text-zinc-500">{k}</p>
            <p className="mt-1 text-xl font-semibold">{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-2">Seller</th>
              <th className="px-4 py-2 text-right">Earned (delivered)</th>
              <th className="px-4 py-2 text-right">Paid</th>
              <th className="px-4 py-2 text-right">Due</th>
              <th className="px-4 py-2 text-right">In progress</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map(({ v, s, unread }) => (
              <tr key={v.id}>
                <td className="px-4 py-2">
                  <Link href={`/admin/payouts/${v.id}`} className="font-medium text-teal-800 hover:underline">
                    {v.storeName}
                  </Link>
                  {v.displayName && v.displayName !== v.storeName ? <span className="block text-xs text-zinc-500">shown as {v.displayName}</span> : null}
                </td>
                <td className="px-4 py-2 text-right">{m(s.earnedCents)}</td>
                <td className="px-4 py-2 text-right">{m(s.paidCents)}</td>
                <td className={`px-4 py-2 text-right font-semibold ${s.dueCents > 0 ? "text-amber-800" : s.dueCents < 0 ? "text-emerald-700" : ""}`}>
                  {s.dueCents < 0 ? `${m(-s.dueCents)} advance` : m(s.dueCents)}
                </td>
                <td className="px-4 py-2 text-right text-zinc-600">{m(s.inProgressCents)}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/admin/payouts/${v.id}`} className="whitespace-nowrap rounded border border-zinc-300 px-2 py-1 text-xs">
                    Open{unread ? ` · ${unread} new` : ""}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-4 text-sm text-zinc-500">No seller has orders or payments yet. Choose &quot;All sellers&quot; to message one.</p> : null}
      </div>
    </div>
  );
}
