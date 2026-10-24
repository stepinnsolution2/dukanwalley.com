import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { advertiserSchema, firstIssue } from "@/lib/ad-booking";
import { AD_PLACEMENTS } from "@/lib/ad-placements";

/** Companies with their bookings and all-time views/clicks per booking. */
export async function GET() {
  const authz = await requirePermission("ads:manage");
  if (!authz.ok) return authz.response;
  const [advertisers, totals] = await Promise.all([
    prisma.advertiser.findMany({
      orderBy: { name: "asc" },
      include: { banners: { orderBy: { startsAt: "desc" } } },
    }),
    prisma.adStat.groupBy({ by: ["adBannerId"], _sum: { impressions: true, clicks: true } }),
  ]);
  const byBanner = new Map(totals.map((t) => [t.adBannerId, t._sum]));
  return NextResponse.json({
    placements: AD_PLACEMENTS,
    advertisers: advertisers.map((a) => ({
      ...a,
      banners: a.banners.map((b) => ({
        ...b,
        impressions: byBanner.get(b.id)?.impressions ?? 0,
        clicks: byBanner.get(b.id)?.clicks ?? 0,
      })),
    })),
  });
}

export async function POST(req: Request) {
  const authz = await requirePermission("ads:manage");
  if (!authz.ok) return authz.response;
  const parsed = advertiserSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const d = parsed.data;
  const advertiser = await prisma.advertiser.create({
    data: { name: d.name, contactName: d.contactName || null, phone: d.phone || null, email: d.email || null, notes: d.notes || null },
  });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "ADVERTISER_CREATE", entity: "Advertiser", entityId: advertiser.id },
  });
  return NextResponse.json({ advertiser });
}
