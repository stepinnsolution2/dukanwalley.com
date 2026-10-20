import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "VENDOR") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { email: true, name: true } },
      products: {
        select: { id: true, name: true, approvalStatus: true, availableForSale: true },
      },
    },
  });
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 404 });
  return NextResponse.json({ vendor: profile });
}
