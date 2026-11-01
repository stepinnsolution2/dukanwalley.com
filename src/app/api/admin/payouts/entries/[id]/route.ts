import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/authz";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ voidReason: z.string().trim().min(3).max(300) });

/** Voids a payment recorded by mistake (kept in the thread, struck through, no longer counted). */
export async function PATCH(req: Request, { params }: Params) {
  const authz = await requirePermission("payouts:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Say why the payment is being voided" }, { status: 400 });
  const res = await prisma.vendorAccountEntry.updateMany({
    where: { id, kind: "PAYMENT", voidedAt: null },
    data: { voidedAt: new Date(), voidReason: `${parsed.data.voidReason} (${authz.session.user.name ?? "admin"})` },
  });
  if (!res.count) return NextResponse.json({ error: "Not found or already voided" }, { status: 404 });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "VENDOR_PAYMENT_VOID", entity: "VendorAccountEntry", entityId: id, meta: { reason: parsed.data.voidReason } },
  });
  return NextResponse.json({ ok: true });
}
