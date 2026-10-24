import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { pktDayEnd, pktDayStart } from "@/lib/ads";
import { deleteStoredMedia } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const patchSchema = z.object({
  alt: z.string().trim().min(3).max(150).optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
  /** Pakistan dates; null clears the limit. */
  startDate: day.nullable().optional(),
  endDate: day.nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  const authz = await requirePermission("banners:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the values entered" }, { status: 400 });
  const banner = await prisma.heroBanner.findUnique({ where: { id } });
  if (!banner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { startDate, endDate, ...rest } = parsed.data;
  const startsAt = startDate === undefined ? banner.startsAt : startDate && pktDayStart(startDate);
  const endsAt = endDate === undefined ? banner.endsAt : endDate && pktDayEnd(endDate);
  if (startsAt && endsAt && endsAt < startsAt) return NextResponse.json({ error: "End date is before the start date" }, { status: 400 });
  const updated = await prisma.heroBanner.update({ where: { id }, data: { ...rest, startsAt, endsAt } });
  return NextResponse.json({ banner: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requirePermission("banners:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const banner = await prisma.heroBanner.findUnique({ where: { id } });
  if (!banner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.heroBanner.delete({ where: { id } });
  await deleteStoredMedia(banner.imageUrl);
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "HERO_BANNER_DELETE", entity: "HeroBanner", entityId: id },
  });
  return NextResponse.json({ ok: true });
}
