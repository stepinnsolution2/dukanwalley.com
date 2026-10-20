import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import type { Prisma } from "@/generated/prisma/client";

const STATUSES = ["ACTIVE", "UNSUBSCRIBED"] as const;

function whereFrom(sp: URLSearchParams): Prisma.NewsletterSubscriberWhereInput {
  const status = sp.get("status");
  const q = sp.get("q")?.trim();
  return {
    ...(status && (STATUSES as readonly string[]).includes(status) ? { status } : {}),
    ...(q ? { email: { contains: q, mode: "insensitive" } } : {}),
  };
}

/** Quote a CSV cell and neutralise spreadsheet formulas (=, +, -, @). */
function csvCell(v: string | null) {
  const s = v ?? "";
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Subscribers list (status, q filters); `?format=csv` downloads all matches. */
export async function GET(req: Request) {
  const authz = await requirePermission("newsletter:view");
  if (!authz.ok) return authz.response;
  const sp = new URL(req.url).searchParams;
  const where = whereFrom(sp);

  if (sp.get("format") === "csv") {
    const all = await prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: "desc" } });
    const rows = [
      ["email", "phone", "status", "source", "subscribed_at"].join(","),
      ...all.map((s) => [s.email, s.phone, s.status, s.source, s.createdAt.toISOString()].map(csvCell).join(",")),
    ];
    return new NextResponse(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const [subscribers, counts] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return NextResponse.json({
    subscribers,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
}

const patchSchema = z.object({ id: z.string().min(1), status: z.enum(STATUSES) });

export async function PATCH(req: Request) {
  const authz = await requirePermission("newsletter:manage");
  if (!authz.ok) return authz.response;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id, status } = parsed.data;
  const res = await prisma.newsletterSubscriber.updateMany({ where: { id }, data: { status } });
  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "NEWSLETTER_STATUS", entity: "NewsletterSubscriber", entityId: id, meta: { status } },
  });
  return NextResponse.json({ ok: true });
}
