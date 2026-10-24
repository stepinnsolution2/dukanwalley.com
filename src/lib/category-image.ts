import sharp from "sharp";
import { encodeWebp, ImageUploadError, inspectImage, MAX_IMAGE_UPLOAD_BYTES } from "@/lib/image-upload";

// Category tile images uploaded in Admin › Categories. The upload is checked (see image-upload.ts),
// then rebuilt into one consistent asset: a square WebP of up to 512×512 (twice the largest tile
// size, for sharp screens; smaller uploads are never enlarged).

export const TILE_SIZE = 512;
export const MAX_UPLOAD_BYTES = MAX_IMAGE_UPLOAD_BYTES;
const MIN_SIDE = 256;
const RECOMMENDED_SIDE = 512;
const TARGET_BYTES = 150 * 1024;

export { ImageUploadError as CategoryImageError };

export type ProcessedImage = { data: Buffer; bytes: number; side: number; notes: string[] };

/**
 * For an opaque image with a plain one-colour border (typical product shot on white): trims the
 * border and centres the subject on a square of that colour. Null when there is no such border
 * (the trim would remove under 15% of the area), i.e. a normal photo.
 */
async function centreOnPlainBackground(base: () => sharp.Sharp, size: number): Promise<sharp.Sharp | null> {
  const original = await base().metadata();
  const area = (original.width ?? 0) * (original.height ?? 0);
  const trimmed = await base()
    .trim({ threshold: 18 })
    .png()
    .toBuffer({ resolveWithObject: true })
    .catch(() => null);
  if (!trimmed || !area || trimmed.info.width * trimmed.info.height > area * 0.85) return null;
  // The border colour, from the top-left corner (where trim found it).
  const [r, g, b] = await base().extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  const background = { r, g, b, alpha: 1 };
  const inner = Math.round(size * 0.84);
  const pad = Math.round((size - inner) / 2);
  return sharp(trimmed.data)
    .resize(inner, inner, { fit: "contain", background })
    .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background });
}

/** Validates and rebuilds an uploaded tile image. Throws ImageUploadError with a readable reason. */
export async function processCategoryImage(input: Buffer): Promise<ProcessedImage> {
  const img = await inspectImage(input, MIN_SIDE);
  const { width, height } = img;
  const notes: string[] = [];
  if (Math.min(width, height) < RECOMMENDED_SIDE) {
    notes.push(`Image is ${width}×${height}; ${RECOMMENDED_SIDE}×${RECOMMENDED_SIDE} or larger looks sharper on high-resolution screens.`);
  }
  const lopsided = Math.max(width, height) / Math.min(width, height) > 2;

  // Never enlarge: a smaller upload stays at its own size rather than getting blurrier and heavier.
  const size = Math.min(TILE_SIZE, Math.min(width, height));
  let square: sharp.Sharp;
  if (img.hasAlpha) {
    // Cut-out (transparent) artwork: trim empty edges, then centre it with even padding so
    // every tile's subject has the same visual size.
    let trimmed = await img.open().trim({ threshold: 10 }).png().toBuffer().catch(() => null);
    trimmed ??= await img.open().png().toBuffer();
    const inner = Math.round(size * 0.84);
    const pad = Math.round((size - inner) / 2);
    const clear = { r: 0, g: 0, b: 0, alpha: 0 };
    square = sharp(trimmed)
      .resize(inner, inner, { fit: "contain", background: clear })
      .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: clear });
    if (lopsided) notes.push("Very wide or tall image: it was fitted into the square tile, so check the preview.");
  } else {
    const framed = await centreOnPlainBackground(img.open, size);
    if (framed) {
      // Product shot on a plain background: subject centred with even margins in that colour.
      square = framed;
      if (lopsided) notes.push("Very wide or tall image: it was fitted into the square tile, so check the preview.");
    } else {
      // Scene photo: a square crop that keeps the most detailed region in view.
      square = img.open().resize(size, size, { fit: "cover", position: sharp.strategy.attention });
      if (lopsided) notes.push("Very wide or tall photo: it was cropped to a square, so check the preview.");
    }
    notes.push("Tip: a PNG with a transparent background blends best with the coloured tiles.");
  }

  const data = await encodeWebp(square, TARGET_BYTES);
  return { data, bytes: data.length, side: size, notes };
}
