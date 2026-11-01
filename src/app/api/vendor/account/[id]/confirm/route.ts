import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

/** The vendor confirms a payment arrived. */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "VENDOR") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const res = await prisma.vendorAccountEntry.updateMany({
    where: { id, kind: "PAYMENT", voidedAt: null, confirmedAt: null, vendor: { userId: session.user.id } },
    data: { confirmedAt: new Date() },
  });
  if (!res.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
