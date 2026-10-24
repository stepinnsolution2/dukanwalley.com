import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { pktDay } from "@/lib/ads";

/** Views and clicks per booking and per company between two Pakistan dates (inclusive). */
export async function GET(req: Request) {
  const authz = await requirePermission("ads:manage");
  if (!authz.ok) return authz.response;
  const sp = new URL(req.url).searchParams;
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const to = valid(sp.get("to")) ?? pktDay();
  const from = valid(sp.get("from")) ?? pktDay(new Date(Date.now() - 29 * 86_400_000));
  if (from > to) return NextResponse.json({ error: "From is after To" }, { status: 400 });

  const rows = await prisma.adStat.groupBy({
    by: ["adBannerId"],
    where: { day: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
    _sum: { impressions: true, clicks: true },
  });
  const bookings = await prisma.adBanner.findMany({
    where: { id: { in: rows.map((r) => r.adBannerId) } },
    select: { id: true, placement: true, alt: true, advertiser: { select: { id: true, name: true } } },
  });
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const perBooking = rows
    .map((r) => {
      const b = byId.get(r.adBannerId);
      const impressions = r._sum.impressions ?? 0;
      const clicks = r._sum.clicks ?? 0;
      return b ? { id: b.id, advertiser: b.advertiser.name, advertiserId: b.advertiser.id, placement: b.placement, alt: b.alt, impressions, clicks } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.advertiser.localeCompare(b.advertiser) || b.impressions - a.impressions);

  const companies = new Map<string, { advertiser: string; impressions: number; clicks: number }>();
  for (const r of perBooking) {
    const c = companies.get(r.advertiserId) ?? { advertiser: r.advertiser, impressions: 0, clicks: 0 };
    c.impressions += r.impressions;
    c.clicks += r.clicks;
    companies.set(r.advertiserId, c);
  }
  return NextResponse.json({ from, to, perBooking, perCompany: [...companies.values()] });
}
