import { cookies } from "next/headers";
import { DEFAULT_MARKET, isMarketCode, MARKET_COOKIE, type MarketCode } from "@/lib/markets";

/** The storefront the shopper is browsing, from the market cookie. */
export async function getCurrentMarket(): Promise<MarketCode> {
  const value = (await cookies()).get(MARKET_COOKIE)?.value;
  return isMarketCode(value) ? value : DEFAULT_MARKET;
}
