import { formatMoney, type MarketCode } from "@/lib/markets";

/** Crossed-out "was" price and % off, shown only when it's above the selling price. */
export function WasPrice({
  market,
  price,
  compareAt,
  className = "text-xs",
}: {
  market: MarketCode;
  price: number;
  compareAt: { toString(): string } | number | string | null | undefined;
  className?: string;
}) {
  const was = compareAt == null ? 0 : Number(compareAt);
  if (!(was > price)) return null;
  const off = Math.round((1 - price / was) * 100);
  return (
    <span className={`inline-flex items-baseline gap-1 ${className}`}>
      <s className="text-zinc-400">{formatMoney(market, was)}</s>
      {off > 0 ? <span className="font-semibold text-red-600">-{off}%</span> : null}
    </span>
  );
}
