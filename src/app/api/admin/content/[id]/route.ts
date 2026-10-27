import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { validSlug } from "@/lib/content";
import { ImageUploadError, MAX_IMAGE_UPLOAD_BYTES, processBannerImage } from "@/lib/image-upload";
import { deleteStoredMedia, saveProcessedImage } from "@/lib/storage";
import { contentSchema } from "@/lib/content-schema";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const authz = await requirePermission("content:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const existing = await prisma.contentPage.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = contentSchema.omit({ kind: true }).partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the fields" }, { status: 400 });
  const d = parsed.data;
  if (d.slug !== undefined && d.slug !== existing.slug) {
    const slugError = validSlug(d.slug, existing.kind as "page" | "post");
    if (slugError) return NextResponse.json({ error: slugError }, { status: 400 });
    if (await prisma.contentPage.findUnique({ where: { kind_slug: { kind: existing.kind, slug: d.slug } } })) {
      return NextResponse.json({ error: "Another page already uses this address" }, { status: 409 });
    }
  }
  const item = await prisma.contentPage.update({
    where: { id },
    data: {
      ...d,
      ...(d.excerpt !== undefined ? { excerpt: d.excerpt || null } : {}),
      ...(d.seoTitle !== undefined ? { seoTitle: d.seoTitle || null } : {}),
      ...(d.seoDescription !== undefined ? { seoDescription: d.seoDescription || null } : {}),
      // First publish sets the date shown on posts; later edits keep it.
      ...(d.status === "published" && !existing.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "CONTENT_UPDATE", entity: "ContentPage", entityId: id, meta: { status: item.status } },
  });
  return NextResponse.json({ item });
}

/** Cover image (multipart "file"): 1200×630, the size social networks show in link previews. */
export async function POST(req: Request, { params }: Params) {
  const authz = await requirePermission("content:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const existing = await prisma.contentPage.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image" }, { status: 400 });
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return NextResponse.json({ error: "Image is larger than 8 MB" }, { status: 413 });
  try {
    const out = await processBannerImage(Buffer.from(await file.arrayBuffer()), {
      width: 1200,
      height: 630,
      minWidth: 800,
      strictAspect: false,
      targetBytes: 200 * 1024,
    });
    const coverImageUrl = await saveProcessedImage(out.data, `${existing.kind}-${existing.slug}`, "webp");
    await prisma.contentPage.update({ where: { id }, data: { coverImageUrl } });
    if (existing.coverImageUrl) await deleteStoredMedia(existing.coverImageUrl);
    return NextResponse.json({ coverImageUrl, notes: out.notes });
  } catch (e) {
    if (e instanceof ImageUploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requirePermission("content:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const existing = await prisma.contentPage.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.contentPage.delete({ where: { id } });
  if (existing.coverImageUrl) await deleteStoredMedia(existing.coverImageUrl);
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "CONTENT_DELETE", entity: "ContentPage", entityId: id, meta: { slug: existing.slug } },
  });
  return NextResponse.json({ ok: true });
}
