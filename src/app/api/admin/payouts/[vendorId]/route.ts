import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authz";
import { paidOnDate, readEntryForm } from "@/lib/account-entry-form";
import { prisma } from "@/lib/db";
import { addEntry } from "@/lib/vendor-account";

type Params = { params: Promise<{ vendorId: string }> };

/** Admin posts to a vendor's account thread: a payment (amount, method, reference, date) or a message. */
export async function POST(req: Request, { params }: Params) {
  const authz = await requirePermission("payouts:manage");
  if (!authz.ok) return authz.response;
  const { vendorId } = await params;
  const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId }, select: { id: true } });
  if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  const r = await readEntryForm(req, true);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { form } = r;
  const entry = await addEntry({
    vendorId,
    side: "ADMIN",
    author: { id: authz.session.user.id, name: authz.session.user.name ?? "DukanWalley" },
    kind: form.kind,
    body: form.body,
    amount: form.amount,
    method: form.method,
    reference: form.reference,
    paidOn: paidOnDate(form.paidOn),
    attachments: form.attachments,
  });
  await prisma.auditLog.create({
    data: {
      userId: authz.session.user.id,
      action: form.kind === "PAYMENT" ? "VENDOR_PAYMENT" : "VENDOR_MESSAGE",
      entity: "VendorAccountEntry",
      entityId: entry.id,
      meta: { vendorId, amount: form.amount ?? null },
    },
  });
  return NextResponse.json({ id: entry.id });
}
