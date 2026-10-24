import { prisma } from "@/lib/db";
import { toPktDay, type AdPlacement } from "@/lib/ad-placements";

// Paid advertising: which bookings are live, and counting their views and clicks per day.
// Days and date pickers use Pakistan time (UTC+5, no daylight saving).

/** "2026-11-01" → the instant that day starts (or ends) in Pakistan. */
export function pktDayStart(day: string) {
  return new Date(`${day}T00:00:00.000+05:00`);
}
export function pktDayEnd(day: string) {
  return new Date(`${day}T23:59:59.999+05:00`);
}
/** The Pakistan calendar date of an instant, as "YYYY-MM-DD". */
export function pktDay(d: Date = new Date()) {
  return toPktDay(d);
}

export type LiveAd = { id: string; imageUrl: string; alt: string; hasLink: boolean };

/** Bookings showing now in a section (active and inside their dates). */
export async function liveAds(placement: AdPlacement): Promise<LiveAd[]> {
  const now = new Date();
  const ads = await prisma.adBanner.findMany({
    where: { placement, isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    select: { id: true, imageUrl: true, alt: true, linkUrl: true },
    orderBy: { startsAt: "asc" },
    take: 20,
  });
  return ads.map((a) => ({ id: a.id, imageUrl: a.imageUrl, alt: a.alt, hasLink: !!a.linkUrl }));
}

/** Crawlers and link previewers aren't people; their views and clicks aren't billed. */
export function isBot(userAgent: string | null) {
  return !userAgent || /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|curl|wget|python|headless/i.test(userAgent);
}

/** Adds to today's counters for these bookings (ids that aren't live are ignored). */
export async function recordAdEvents(ids: string[], kind: "impressions" | "clicks") {
  const now = new Date();
  const live = await prisma.adBanner.findMany({
    where: { id: { in: [...new Set(ids)] }, isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    select: { id: true },
  });
  const day = new Date(`${pktDay(now)}T00:00:00.000Z`);
  await Promise.all(
    live.map(({ id }) =>
      prisma.adStat.upsert({
        where: { adBannerId_day: { adBannerId: id, day } },
        create: { adBannerId: id, day, [kind]: 1 },
        update: { [kind]: { increment: 1 } },
      }),
    ),
  );
  return live.length;
}
