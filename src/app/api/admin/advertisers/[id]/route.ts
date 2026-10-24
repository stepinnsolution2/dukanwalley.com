import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { advertiserSchema, firstIssue } from "@/lib/ad-booking";
import { deleteStoredMedia } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const authz = await requirePermission("ads:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const parsed = advertiserSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  if (!(await prisma.advertiser.findUnique({ where: { id } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const d = parsed.data;
  const blankToNull = (v: string | undefined) => (v === undefined ? undefined : v || null);
  const advertiser = await prisma.advertiser.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      contactName: blankToNull(d.contactName),
      phone: blankToNull(d.phone),
      email: blankToNull(d.email),
      notes: blankToNull(d.notes),
    },
  });
  return NextResponse.json({ advertiser });
}

/** Deletes the company with all its bookings, their stats and images. */
export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requirePermission("ads:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const advertiser = await prisma.advertiser.findUnique({ where: { id }, include: { banners: { select: { imageUrl: true } } } });
  if (!advertiser) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.advertiser.delete({ where: { id } });
  for (const b of advertiser.banners) await deleteStoredMedia(b.imageUrl);
  await prisma.auditLog.create({
    data: {
      userId: authz.session.user.id,
      action: "ADVERTISER_DELETE",
      entity: "Advertiser",
      entityId: id,
      meta: { name: advertiser.name, bookings: advertiser.banners.length },
    },
  });
  return NextResponse.json({ ok: true });
}
