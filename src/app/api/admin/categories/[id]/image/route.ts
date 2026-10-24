import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { CategoryImageError, MAX_UPLOAD_BYTES, processCategoryImage } from "@/lib/category-image";
import { deleteStoredMedia, saveProcessedImage } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

/** Upload (multipart "file") a category tile image: checked, rebuilt as a square WebP (≤512px), saved. */
export async function POST(req: Request, { params }: Params) {
  const authz = await requirePermission("catalog:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Image is larger than 8 MB" }, { status: 413 });

  let processed;
  try {
    processed = await processCategoryImage(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof CategoryImageError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  // Named after the category (SEO-friendly URL); the old file is removed once replaced.
  const imageUrl = await saveProcessedImage(processed.data, category.slug, "webp");
  await prisma.category.update({ where: { id }, data: { imageUrl } });
  if (category.imageUrl) await deleteStoredMedia(category.imageUrl);
  await prisma.auditLog.create({
    data: {
      userId: authz.session.user.id,
      action: "CATEGORY_IMAGE_SET",
      entity: "Category",
      entityId: id,
      meta: { file: file.name, originalBytes: file.size, savedBytes: processed.bytes },
    },
  });
  return NextResponse.json({ imageUrl, bytes: processed.bytes, side: processed.side, notes: processed.notes });
}

/** Remove the tile image (the placeholder shows instead). */
export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requirePermission("catalog:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (category.imageUrl) {
    await prisma.category.update({ where: { id }, data: { imageUrl: null } });
    await deleteStoredMedia(category.imageUrl);
    await prisma.auditLog.create({
      data: { userId: authz.session.user.id, action: "CATEGORY_IMAGE_REMOVE", entity: "Category", entityId: id },
    });
  }
  return NextResponse.json({ ok: true });
}
