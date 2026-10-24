import sharp from "sharp";

// Category tile images uploaded in Admin › Categories. The upload is checked, then rebuilt into
// one consistent asset: a square sRGB WebP of up to 512×512 (twice the largest tile size, for
// sharp screens; smaller uploads are never enlarged), with camera metadata (GPS, device) removed.

export const TILE_SIZE = 512;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MIN_SIDE = 256;
const RECOMMENDED_SIDE = 512;
/** Rejects decompression bombs: a small file that decodes to an enormous image. */
const MAX_INPUT_PIXELS = 40_000_000;
const TARGET_BYTES = 150 * 1024;
const FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif"]);

export class CategoryImageError extends Error {}

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

/** Validates and rebuilds an uploaded tile image. Throws CategoryImageError with a readable reason. */
export async function processCategoryImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length > MAX_UPLOAD_BYTES) throw new CategoryImageError("Image is larger than 8 MB");
  const notes: string[] = [];

  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new CategoryImageError("This file isn't a readable image (or it is too large in pixels)");
  }
  if (!meta.format || !FORMATS.has(meta.format)) {
    throw new CategoryImageError("Use a JPG, PNG, WebP or AVIF image");
  }
  if ((meta.pages ?? 1) > 1) throw new CategoryImageError("Animated images aren't supported; use a still image");

  // Orientation 5–8 means the camera stored the picture rotated by 90°.
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (Math.min(width, height) < MIN_SIDE) {
    throw new CategoryImageError(`Image is too small (${width}×${height}). Use at least ${RECOMMENDED_SIDE}×${RECOMMENDED_SIDE} pixels.`);
  }
  if (Math.min(width, height) < RECOMMENDED_SIDE) {
    notes.push(`Image is ${width}×${height}; ${RECOMMENDED_SIDE}×${RECOMMENDED_SIDE} or larger looks sharper on high-resolution screens.`);
  }
  const lopsided = Math.max(width, height) / Math.min(width, height) > 2;

  // Every channel (colour and transparency) flat means a blank or broken upload. Flat-colour
  // illustrations still vary between subject and background, so they pass.
  const stats = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().stats();
  if (stats.channels.every((c) => c.stdev < 4)) throw new CategoryImageError("Image looks blank or almost a single colour");

  // Never enlarge: a smaller upload stays at its own size rather than getting blurrier and heavier.
  const size = Math.min(TILE_SIZE, Math.min(width, height));
  const base = () => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toColourspace("srgb");
  let square: sharp.Sharp;
  if (meta.hasAlpha) {
    // Cut-out (transparent) artwork: trim empty edges, then centre it with even padding so
    // every tile's subject has the same visual size.
    let trimmed = await base().trim({ threshold: 10 }).png().toBuffer().catch(() => null);
    trimmed ??= await base().png().toBuffer();
    const inner = Math.round(size * 0.84);
    const pad = Math.round((size - inner) / 2);
    const clear = { r: 0, g: 0, b: 0, alpha: 0 };
    square = sharp(trimmed)
      .resize(inner, inner, { fit: "contain", background: clear })
      .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: clear });
    if (lopsided) notes.push("Very wide or tall image: it was fitted into the square tile, so check the preview.");
  } else {
    const framed = await centreOnPlainBackground(base, size);
    if (framed) {
      // Product shot on a plain background: subject centred with even margins in that colour.
      square = framed;
      if (lopsided) notes.push("Very wide or tall image: it was fitted into the square tile, so check the preview.");
    } else {
      // Scene photo: a square crop that keeps the most detailed region in view.
      square = base().resize(size, size, { fit: "cover", position: sharp.strategy.attention });
      if (lopsided) notes.push("Very wide or tall photo: it was cropped to a square, so check the preview.");
    }
    notes.push("Tip: a PNG with a transparent background blends best with the coloured tiles.");
  }
  // Light sharpening restores crispness lost when downscaling.
  const prepared = await square.sharpen({ sigma: 0.6 }).png().toBuffer();

  // WebP keeps transparency at a fraction of PNG's size; step quality down to stay light.
  let data: Buffer = Buffer.alloc(0);
  for (const quality of [85, 78, 70]) {
    data = await sharp(prepared).webp({ quality, alphaQuality: 90, effort: 5 }).toBuffer();
    if (data.length <= TARGET_BYTES) break;
  }
  return { data, bytes: data.length, side: size, notes };
}
