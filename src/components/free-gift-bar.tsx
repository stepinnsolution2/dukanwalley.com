import { formatMoney, type MarketCode } from "@/lib/markets";

/** "Add Rs 450 more for a free gift" / "Your order gets a free gift", for cart and checkout. */
export function FreeGiftBar({ market, itemsTotal, min }: { market: MarketCode; itemsTotal: number; min: number | null }) {
  if (!min || itemsTotal <= 0) return null;
  const left = Math.max(0, min - itemsTotal);
  const pct = Math.min(100, Math.round((itemsTotal / min) * 100));
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">
        {left > 0 ? (
          <>
            🎁 Add {formatMoney(market, left)} more to get a <strong>free gift</strong> with your order
          </>
        ) : (
          <>🎁 Your order gets a free gift!</>
        )}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100">
        <div className="h-full rounded-full bg-[#f47b20] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
