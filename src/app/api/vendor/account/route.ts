import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readEntryForm } from "@/lib/account-entry-form";
import { prisma } from "@/lib/db";
import { addEntry } from "@/lib/vendor-account";

/** A vendor writes in their account thread (messages and files; payments are recorded by us). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "VENDOR") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: session.user.id }, select: { id: true, storeName: true } });
  if (!vendor) return NextResponse.json({ error: "No vendor profile" }, { status: 404 });
  const r = await readEntryForm(req, false);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const entry = await addEntry({
    vendorId: vendor.id,
    side: "VENDOR",
    author: { id: session.user.id, name: session.user.name ?? vendor.storeName },
    kind: "MESSAGE",
    body: r.form.body,
    attachments: r.form.attachments,
  });
  return NextResponse.json({ id: entry.id });
}
