import { NextResponse } from "next/server";
import { liveAds } from "@/lib/ads";
import { isAdPlacement } from "@/lib/ad-placements";

/** Live ads for a section, for client-rendered spots (the cart panel). Server pages query directly. */
export async function GET(req: Request) {
  const placement = new URL(req.url).searchParams.get("placement");
  if (!isAdPlacement(placement)) return NextResponse.json({ error: "Unknown placement" }, { status: 400 });
  return NextResponse.json({ ads: await liveAds(placement) }, { headers: { "Cache-Control": "no-store" } });
}
