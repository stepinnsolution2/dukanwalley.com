import { AdRotator } from "@/components/ad-rotator";
import { liveAds } from "@/lib/ads";
import { AD_PLACEMENTS, type AdPlacement } from "@/lib/ad-placements";

/** A paid advertising section; renders nothing when no booking is live there. */
export async function AdSlot({ placement, className = "" }: { placement: AdPlacement; className?: string }) {
  const ads = await liveAds(placement);
  if (!ads.length) return null;
  const spec = AD_PLACEMENTS[placement];
  return (
    <aside aria-label="Advertisement" className={className}>
      <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-100" style={{ aspectRatio: `${spec.width} / ${spec.height}` }}>
        <AdRotator ads={ads} label={`${spec.label} advertisements`} sizes={`(max-width: 1024px) 100vw, ${spec.width}px`} />
      </div>
    </aside>
  );
}
