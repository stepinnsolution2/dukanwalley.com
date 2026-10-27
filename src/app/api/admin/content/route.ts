import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { validSlug } from "@/lib/content";
import { contentSchema } from "@/lib/content-schema";

/** All pages and posts (drafts included) for the admin list. */
export async function GET() {
  const authz = await requirePermission("content:manage");
  if (!authz.ok) return authz.response;
  const items = await prisma.contentPage.findMany({ orderBy: [{ kind: "asc" }, { updatedAt: "desc" }] });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const authz = await requirePermission("content:manage");
  if (!authz.ok) return authz.response;
  const parsed = contentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the fields" }, { status: 400 });
  const d = parsed.data;
  const slugError = validSlug(d.slug, d.kind);
  if (slugError) return NextResponse.json({ error: slugError }, { status: 400 });
  if (await prisma.contentPage.findUnique({ where: { kind_slug: { kind: d.kind, slug: d.slug } } })) {
    return NextResponse.json({ error: "Another page already uses this address" }, { status: 409 });
  }
  const item = await prisma.contentPage.create({
    data: { ...d, excerpt: d.excerpt || null, seoTitle: d.seoTitle || null, seoDescription: d.seoDescription || null, publishedAt: d.status === "published" ? new Date() : null },
  });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "CONTENT_CREATE", entity: "ContentPage", entityId: item.id, meta: { kind: d.kind, slug: d.slug } },
  });
  return NextResponse.json({ item });
}
