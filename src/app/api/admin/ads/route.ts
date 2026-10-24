import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { bookingData, createBookingSchema, firstIssue } from "@/lib/ad-booking";
import { saveAdImage } from "@/lib/ad-image";
import type { AdPlacement } from "@/lib/ad-placements";

/** New booking (multipart: file + booking fields). */
export async function POST(req: Request) {
  const authz = await requirePermission("ads:manage");
  if (!authz.ok) return authz.response;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const parsed = createBookingSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const d = parsed.data;
  if (d.endDate < d.startDate) return NextResponse.json({ error: "End date is before the start date" }, { status: 400 });
  const advertiser = await prisma.advertiser.findUnique({ where: { id: d.advertiserId } });
  if (!advertiser) return NextResponse.json({ error: "Unknown company" }, { status: 400 });

  const saved = await saveAdImage(form.get("file"), d.placement as AdPlacement, advertiser.name);
  if ("error" in saved) return saved.error;
  const booking = await prisma.adBanner.create({
    data: {
      advertiserId: advertiser.id,
      placement: d.placement,
      imageUrl: saved.imageUrl,
      ...bookingData(d),
    } as Parameters<typeof prisma.adBanner.create>[0]["data"],
  });
  await prisma.auditLog.create({
    data: {
      userId: authz.session.user.id,
      action: "AD_BOOKING_CREATE",
      entity: "AdBanner",
      entityId: booking.id,
      meta: { advertiser: advertiser.name, placement: d.placement, from: d.startDate, to: d.endDate },
    },
  });
  return NextResponse.json({ booking, notes: saved.processed.notes, width: saved.processed.width, height: saved.processed.height });
}
