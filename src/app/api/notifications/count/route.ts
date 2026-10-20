import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ count: 0 });
  }
  const count = await prisma.userNotification.count({
    where: { userId: session.user.id, read: false },
  });
  return NextResponse.json({ count });
}
