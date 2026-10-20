import { after, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import {
  cancelOrder,
  confirmCodOrder,
  notifyOrderCancelled,
  requestCodConfirmation,
  sendOrderNotifications,
} from "@/lib/orders";
import { appBaseUrl } from "@/lib/payments/common";
import { OrderStatus } from "@/generated/prisma/enums";

const bodySchema = z.object({ action: z.enum(["confirm", "cancel", "resend"]) });

type Params = { params: Promise<{ id: string }> };

/** Staff handling of a cash-on-delivery order awaiting confirmation (e.g. after a phone call). */
export async function POST(req: Request, { params }: Params) {
  const authz = await requirePermission("orders:manage");
  if (!authz.ok) return authz.response;
  const { session } = authz;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const { action } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (order.status !== OrderStatus.PLACED) {
    return NextResponse.json({ error: `Order is already ${order.status.toLowerCase()}` }, { status: 409 });
  }

  if (action === "confirm") {
    if (!(await confirmCodOrder(id, `staff:${session.user.id}`))) {
      return NextResponse.json({ error: "Order changed; reload" }, { status: 409 });
    }
    after(() => sendOrderNotifications(id));
  } else if (action === "cancel") {
    if (!(await cancelOrder(id, [OrderStatus.PLACED], `staff:${session.user.id}`, "Cancelled after contacting buyer"))) {
      return NextResponse.json({ error: "Order changed; reload" }, { status: 409 });
    }
    after(() => notifyOrderCancelled(id, "it was cancelled by our team"));
  } else {
    const appUrl = appBaseUrl(req.url);
    after(() => requestCodConfirmation(id, appUrl));
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: `COD_${action.toUpperCase()}`,
      entity: "Order",
      entityId: id,
    },
  });
  return NextResponse.json({ ok: true });
}
