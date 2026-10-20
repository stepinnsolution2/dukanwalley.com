import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isMarketCode, MARKET_COOKIE } from "@/lib/markets";

/** Market switcher: a plain form POST, then back to the page the shopper was on. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const market = form?.get("market");
  if (!isMarketCode(market)) {
    return NextResponse.json({ error: "Unknown market" }, { status: 400 });
  }
  (await cookies()).set(MARKET_COOKIE, market, {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  const origin = new URL(req.url).origin;
  const back = req.headers.get("referer");
  // Only redirect within this site.
  const target = back && new URL(back, origin).origin === origin ? back : "/";
  return NextResponse.redirect(new URL(target, origin), 303);
}
