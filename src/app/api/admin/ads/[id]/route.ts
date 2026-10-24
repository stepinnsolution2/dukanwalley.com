import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { bookingData, firstIssue, updateBookingSchema } from "@/lib/ad-booking";
import { saveAdImage } from "@/lib/ad-image";
import { isAdPlacement } from "@/lib/ad-placements";
import { deleteStoredMedia } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

/** Edit a booking's details (dates, link, price, pause…). The section can't change: re-book instead. */
export async function PATCH(req: Request, { params }: Params) {
  const authz = await requirePermission("ads:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const parsed = updateBookingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const booking = await prisma.adBanner.findUnique({ where: { id } });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = bookingData(parsed.data);
  if ((data.endsAt ?? booking.endsAt) < (data.startsAt ?? booking.startsAt)) {
    return NextResponse.json({ error: "End date is before the start date" }, { status: 400 });
  }
  const updated = await prisma.adBanner.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "AD_BOOKING_UPDATE", entity: "AdBanner", entityId: id, meta: parsed.data },
  });
  return NextResponse.json({ booking: updated });
}

/** Replace the booking's image (multipart: file); stats are kept. */
export async function POST(req: Request, { params }: Params) {
  const authz = await requirePermission("ads:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const booking = await prisma.adBanner.findUnique({ where: { id }, include: { advertiser: { select: { name: true } } } });
  if (!booking || !isAdPlacement(booking.placement)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const saved = await saveAdImage(form?.get("file"), booking.placement, booking.advertiser.name);
  if ("error" in saved) return saved.error;
  await prisma.adBanner.update({ where: { id }, data: { imageUrl: saved.imageUrl } });
  await deleteStoredMedia(booking.imageUrl);
  return NextResponse.json({ imageUrl: saved.imageUrl, notes: saved.processed.notes });
}

export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requirePermission("ads:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const booking = await prisma.adBanner.findUnique({ where: { id } });
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.adBanner.delete({ where: { id } });
  await deleteStoredMedia(booking.imageUrl);
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "AD_BOOKING_DELETE", entity: "AdBanner", entityId: id, meta: { placement: booking.placement } },
  });
  return NextResponse.json({ ok: true });
}
