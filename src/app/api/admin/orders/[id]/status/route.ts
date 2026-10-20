import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/authz";
import { notifyBuyerStatus, overrideOrderStatus, transitionOrder, TransitionError } from "@/lib/order-lifecycle";
import { appBaseUrl } from "@/lib/payments/common";
import { prisma } from "@/lib/db";
import { OrderStatus } from "@/generated/prisma/enums";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  to: z.nativeEnum(OrderStatus),
  note: z.string().trim().max(500).optional(),
  courier: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
  /** Super admin only: skip the lifecycle rules and side effects. Requires a note. */
  override: z.boolean().optional(),
});

/** Move an order along its lifecycle (processing → shipped → delivered → returned, or cancel COD). */
export async function POST(req: Request, { params }: Params) {
  const staff = await requirePermission();
  if (!staff.ok) return staff.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;
  const authz = await requirePermission(d.override ? "orders:override" : "orders:manage");
  if (!authz.ok) return authz.response;
  const actor = `staff:${authz.session.user.id}`;
  const { id } = await params;

  try {
    if (d.override) {
      if (!d.note) return NextResponse.json({ error: "A reason is required for a manual override" }, { status: 400 });
      await overrideOrderStatus(id, d.to, actor, d.note);
    } else {
      await transitionOrder(id, d.to, { actor, note: d.note, courier: d.courier, trackingNumber: d.trackingNumber });
      const appUrl = appBaseUrl(req.url);
      after(() => notifyBuyerStatus(id, appUrl));
    }
  } catch (e) {
    if (e instanceof TransitionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  await prisma.auditLog.create({
    data: {
      userId: authz.session.user.id,
      action: d.override ? "ORDER_STATUS_OVERRIDE" : "ORDER_STATUS",
      entity: "Order",
      entityId: id,
      meta: { to: d.to, note: d.note ?? null },
    },
  });
  return NextResponse.json({ ok: true });
}
