import { NextResponse } from "next/server";
import { AD_PLACEMENTS, type AdPlacement } from "@/lib/ad-placements";
import { ImageUploadError, MAX_IMAGE_UPLOAD_BYTES, processBannerImage } from "@/lib/image-upload";
import { saveProcessedImage } from "@/lib/storage";
import { slugify } from "@/lib/slug";

/**
 * Checks and stores an ad image for its section's exact size. Returns the saved URL, or an error
 * response the route can return as-is.
 */
export async function saveAdImage(file: unknown, placement: AdPlacement, advertiserName: string) {
  if (!(file instanceof File)) return { error: NextResponse.json({ error: "Choose the banner image" }, { status: 400 }) };
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return { error: NextResponse.json({ error: "Image is larger than 8 MB" }, { status: 413 }) };
  const spec = AD_PLACEMENTS[placement];
  try {
    const processed = await processBannerImage(Buffer.from(await file.arrayBuffer()), {
      width: spec.width,
      height: spec.height,
      minWidth: spec.minWidth,
      strictAspect: true,
      targetBytes: spec.width >= 1200 ? 220 * 1024 : 160 * 1024,
    });
    const imageUrl = await saveProcessedImage(processed.data, `ad-${slugify(advertiserName)}-${placement.replace("_", "-")}`, "webp");
    return { imageUrl, processed };
  } catch (e) {
    if (e instanceof ImageUploadError) return { error: NextResponse.json({ error: e.message }, { status: 400 }) };
    throw e;
  }
}
