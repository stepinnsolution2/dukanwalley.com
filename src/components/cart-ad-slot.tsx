"use client";

import { useEffect, useState } from "react";
import { AdRotator, type AdSlide } from "@/components/ad-rotator";
import { AD_PLACEMENTS } from "@/lib/ad-placements";

/** Cart advertising inside the (client-rendered) cart panel; loads the live cart ads when opened. */
export function CartAdSlot({ open }: { open: boolean }) {
  const [ads, setAds] = useState<AdSlide[] | null>(null);
  useEffect(() => {
    if (!open || ads) return;
    let ignore = false;
    void fetch("/api/ads?placement=cart")
      .then((r) => (r.ok ? r.json() : { ads: [] }))
      .then((j) => {
        if (!ignore) setAds(j.ads ?? []);
      });
    return () => {
      ignore = true;
    };
  }, [open, ads]);

  if (!open || !ads?.length) return null;
  const spec = AD_PLACEMENTS.cart;
  return (
    <aside aria-label="Advertisement" className="mt-6">
      <div className="relative w-full overflow-hidden bg-zinc-100" style={{ aspectRatio: `${spec.width} / ${spec.height}` }}>
        <AdRotator ads={ads} label="Cart advertisements" sizes="(max-width: 1024px) 100vw, 1200px" />
      </div>
    </aside>
  );
}
