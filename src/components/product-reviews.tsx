import Link from "next/link";
import { prisma } from "@/lib/db";
import { Stars } from "@/components/stars";

const SHOWN = 20;

export async function loadProductReviews(productId: string) {
  const [reviews, byStar] = await Promise.all([
    prisma.productReview.findMany({
      where: { productId, status: "published" },
      orderBy: { createdAt: "desc" },
      take: SHOWN,
      select: { id: true, rating: true, title: true, body: true, authorName: true, createdAt: true, orderItem: { select: { variantLabel: true } } },
    }),
    prisma.productReview.groupBy({ by: ["rating"], where: { productId, status: "published" }, _count: { _all: true } }),
  ]);
  return { reviews, byStar: Object.fromEntries(byStar.map((r) => [r.rating, r._count._all])) as Record<number, number> };
}

/** Verified-buyer reviews below the product: average, a 5→1 breakdown and the latest reviews. */
export function ProductReviews({
  avg,
  count,
  reviews,
  byStar,
}: {
  avg: number;
  count: number;
} & Awaited<ReturnType<typeof loadProductReviews>>) {
  return (
    <section id="reviews" className="mt-8 scroll-mt-24 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
      <h2 className="text-2xl font-semibold text-zinc-900">Ratings and reviews</h2>
      {count === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">
          No reviews yet. Bought this? Once it&apos;s delivered you can review it from{" "}
          <Link href="/account/orders" className="text-teal-700 underline">
            My orders
          </Link>{" "}
          or{" "}
          <Link href="/orders/track" className="text-teal-700 underline">
            Track order
          </Link>
          .
        </p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
          <div>
            <p className="text-4xl font-semibold text-zinc-900">{avg.toFixed(1)}</p>
            <Stars rating={avg} className="h-5 w-5" />
            <p className="mt-1 text-sm text-zinc-600">
              {count} verified {count === 1 ? "review" : "reviews"}
            </p>
            <ul className="mt-3 space-y-1 text-xs text-zinc-600">
              {[5, 4, 3, 2, 1].map((star) => {
                const n = byStar[star] ?? 0;
                return (
                  <li key={star} className="flex items-center gap-2">
                    <span className="w-8">{star} ★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
                      <span className="block h-full rounded-full bg-amber-500" style={{ width: `${(n / count) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <ul className="divide-y divide-zinc-100">
            {reviews.map((r) => (
              <li key={r.id} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars rating={r.rating} />
                  {r.title ? <span className="font-semibold text-zinc-900">{r.title}</span> : null}
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {r.authorName} · <span className="text-teal-700">✓ Verified purchase</span>
                  {r.orderItem.variantLabel ? ` · ${r.orderItem.variantLabel}` : ""} ·{" "}
                  {r.createdAt.toLocaleDateString("en-PK", { dateStyle: "medium" })}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{r.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
