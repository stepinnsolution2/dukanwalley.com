import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import type { Prisma } from "@/generated/prisma/client";

const STATUSES = ["ACTIVE", "UNSUBSCRIBED"] as const;

function whereFrom(sp: URLSearchParams): Prisma.NewsletterSubscriberWhereInput {
  const status = sp.get("status");
  const q = sp.get("q")?.trim();
  const list = sp.get("list");
  const source = sp.get("source");
  return {
    ...(status && (STATUSES as readonly string[]).includes(status) ? { status } : {}),
    ...(list === "newsletter" ? { newsletter: true } : list === "reminders" ? { newsletter: false } : {}),
    ...(source ? { source } : {}),
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
      ["email", "phone", "status", "newsletter", "source", "market", "added_at"].join(","),
      ...all.map((s) =>
        [s.email, s.phone, s.status, s.newsletter ? "yes" : "reminders only", s.source, s.market, s.createdAt.toISOString()].map(csvCell).join(","),
      ),
    ];
    return new NextResponse(rows.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [subscribers, total, counts, newsletter, sources, remindersWeek] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.newsletterSubscriber.count({ where }),
    prisma.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.newsletterSubscriber.count({ where: { status: "ACTIVE", newsletter: true } }),
    prisma.newsletterSubscriber.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.notificationCampaignLog.count({ where: { type: "ABANDONED_CART", sentAt: { gte: weekAgo } } }),
  ]);
  return NextResponse.json({
    subscribers,
    total,
    counts: { ...Object.fromEntries(counts.map((c) => [c.status, c._count._all])), NEWSLETTER: newsletter },
    sources: sources.map((s) => ({ source: s.source, count: s._count._all })),
    remindersWeek,
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
