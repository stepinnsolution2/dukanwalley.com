import { prisma } from "@/lib/db";
import { formatMoney, MARKET_CODES, MARKETS } from "@/lib/markets";
import { OrderStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const { denied } = await searchParams;
  const [pending, byMarket, vendorsByMarket] = await Promise.all([
    prisma.product.count({ where: { approvalStatus: "PENDING_REVIEW" } }),
    prisma.order.groupBy({
      by: ["market"],
      where: { status: { notIn: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED] } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.vendorProfile.groupBy({ by: ["market"], _count: { _all: true } }),
  ]);

  return (
    <div className="space-y-6">
      {denied ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Your role doesn&apos;t have access to that page.
        </p>
      ) : null}
      <h1 className="text-2xl font-semibold text-zinc-900">Operations overview</h1>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:max-w-xs">
        <p className="text-sm text-zinc-500">Pending approvals</p>
        <p className="mt-1 text-3xl font-semibold text-amber-700">{pending}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {MARKET_CODES.map((code) => {
          const sales = byMarket.find((r) => r.market === code);
          const vendors = vendorsByMarket.find((r) => r.market === code)?._count._all ?? 0;
          return (
            <div key={code} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-zinc-700">{MARKETS[code].name}</p>
              <p className="mt-2 text-3xl font-semibold text-teal-800">
                {formatMoney(code, sales?._sum.total ?? 0)}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {sales?._count._all ?? 0} orders · {vendors} vendors
              </p>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-zinc-600">
        Revenue counts placed and paid orders (tax-inclusive); unpaid card orders and
        cancellations are excluded.
      </p>
    </div>
  );
}
