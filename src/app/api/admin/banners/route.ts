import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { HERO_SPEC } from "@/lib/ad-placements";
import { ImageUploadError, MAX_IMAGE_UPLOAD_BYTES, processBannerImage } from "@/lib/image-upload";
import { saveProcessedImage } from "@/lib/storage";

export async function GET() {
  const authz = await requirePermission("banners:manage");
  if (!authz.ok) return authz.response;
  const banners = await prisma.heroBanner.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ banners, spec: HERO_SPEC });
}

/** Upload a hero banner (multipart: file, alt). It's smart-cropped to the hero shape. */
export async function POST(req: Request) {
  const authz = await requirePermission("banners:manage");
  if (!authz.ok) return authz.response;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const alt = String(form?.get("alt") ?? "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image" }, { status: 400 });
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return NextResponse.json({ error: "Image is larger than 8 MB" }, { status: 413 });
  if (alt.length < 3 || alt.length > 150) {
    return NextResponse.json({ error: "Describe the image in 3–150 characters (used by search engines and screen readers)" }, { status: 400 });
  }
  let processed;
  try {
    processed = await processBannerImage(Buffer.from(await file.arrayBuffer()), {
      ...HERO_SPEC,
      strictAspect: false,
      targetBytes: 280 * 1024,
    });
  } catch (e) {
    if (e instanceof ImageUploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
  const imageUrl = await saveProcessedImage(processed.data, `banner-${alt.toLowerCase()}`, "webp");
  const last = await prisma.heroBanner.aggregate({ _max: { sortOrder: true } });
  const banner = await prisma.heroBanner.create({
    data: { imageUrl, alt, sortOrder: (last._max.sortOrder ?? 0) + 10 },
  });
  await prisma.auditLog.create({
    data: { userId: authz.session.user.id, action: "HERO_BANNER_CREATE", entity: "HeroBanner", entityId: banner.id },
  });
  return NextResponse.json({ banner, notes: processed.notes, width: processed.width, height: processed.height, bytes: processed.bytes });
}
