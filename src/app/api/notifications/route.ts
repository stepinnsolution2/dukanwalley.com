import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unread") === "1";
  const items = await prisma.userNotification.findMany({
    where: {
      userId: session.user.id,
      ...(unreadOnly ? { read: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ notifications: items });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const ids = body.ids as string[] | undefined;
  if (!ids?.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  await prisma.userNotification.updateMany({
    where: { userId: session.user.id, id: { in: ids } },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
