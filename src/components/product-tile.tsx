import Image from "next/image";
import Link from "next/link";
import { formatMoney, type MarketCode } from "@/lib/markets";
import { canOptimizeImage } from "@/lib/media-url";

type TileProduct = {
  slug: string;
  name: string;
  basePrice: { toString(): string } | number | string;
  isHot?: boolean;
  images: { url: string }[];
};

/** Compact storefront card for dense grids (home page rows). */
export function ProductTile({ product: p, market }: { product: TileProduct; market: MarketCode }) {
  return (
    <Link
      href={`/products/${p.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white transition hover:border-teal-300 hover:shadow-sm"
    >
      <div className="relative aspect-square bg-zinc-100">
        {p.images[0] ? (
          <Image
            src={p.images[0].url}
            alt={p.name}
            fill
            unoptimized={!canOptimizeImage(p.images[0].url)}
            className="object-cover transition group-hover:scale-[1.03]"
            sizes="(max-width:640px) 33vw, (max-width:1024px) 20vw, 15vw"
          />
        ) : null}
        {p.isHot ? (
          <span className="absolute left-1 top-1 rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
            Hot
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-2 py-1.5">
        <h3 className="line-clamp-2 text-xs text-zinc-800">{p.name}</h3>
        <p className="text-sm font-semibold text-teal-800">{formatMoney(market, p.basePrice)}</p>
      </div>
    </Link>
  );
}
