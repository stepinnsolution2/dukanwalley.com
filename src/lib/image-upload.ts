import sharp from "sharp";

// Shared checks and encoding for images uploaded in the admin (category tiles, hero banners, ads):
// real format, size, no animation, not blank, no decompression bombs; output is sRGB WebP with
// camera metadata (GPS, device) removed and the EXIF orientation applied.

export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Rejects decompression bombs: a small file that decodes to an enormous image. */
const MAX_INPUT_PIXELS = 40_000_000;
const FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif"]);

export class ImageUploadError extends Error {}

export type InspectedImage = {
  /** Size as displayed (after applying the camera's orientation). */
  width: number;
  height: number;
  hasAlpha: boolean;
  /** A fresh pipeline of the upload, upright and in sRGB. */
  open: () => sharp.Sharp;
};

/** Checks an upload is a usable still image. Throws ImageUploadError with a readable reason. */
export async function inspectImage(input: Buffer, minSide: number): Promise<InspectedImage> {
  if (input.length > MAX_IMAGE_UPLOAD_BYTES) throw new ImageUploadError("Image is larger than 8 MB");
  const load = () => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS });

  let meta: sharp.Metadata;
  try {
    meta = await load().metadata();
  } catch {
    throw new ImageUploadError("This file isn't a readable image (or it is too large in pixels)");
  }
  if (!meta.format || !FORMATS.has(meta.format)) throw new ImageUploadError("Use a JPG, PNG, WebP or AVIF image");
  if ((meta.pages ?? 1) > 1) throw new ImageUploadError("Animated images aren't supported; use a still image");

  // Orientation 5–8 means the camera stored the picture rotated by 90°.
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? 0;
  const height = (rotated ? meta.width : meta.height) ?? 0;
  if (Math.min(width, height) < minSide) {
    throw new ImageUploadError(`Image is too small (${width}×${height}); the shorter side must be at least ${minSide} pixels.`);
  }

  // Every channel (colour and transparency) flat means a blank or broken upload. Flat-colour
  // illustrations still vary between subject and background, so they pass.
  const stats = await load().rotate().stats();
  if (stats.channels.every((c) => c.stdev < 4)) throw new ImageUploadError("Image looks blank or almost a single colour");

  return { width, height, hasAlpha: !!meta.hasAlpha, open: () => load().rotate().toColourspace("srgb") };
}

/** Lightly sharpened WebP, stepping quality down until it fits the size budget. */
export async function encodeWebp(image: sharp.Sharp, targetBytes: number): Promise<Buffer> {
  const prepared = await image.sharpen({ sigma: 0.6 }).png().toBuffer();
  let data: Buffer = Buffer.alloc(0);
  for (const quality of [85, 78, 70, 62]) {
    data = await sharp(prepared).webp({ quality, alphaQuality: 90, effort: 5 }).toBuffer();
    if (data.length <= targetBytes) break;
  }
  return data;
}

export type BannerSpec = {
  /** Output size; smaller uploads are scaled to fit but never enlarged. */
  width: number;
  height: number;
  /** Smallest acceptable upload width. */
  minWidth: number;
  /**
   * Ads carry the advertiser's own text and logo, so they must already be close to the slot's
   * shape (cropping would cut words off); decorative hero images are smart-cropped instead.
   */
  strictAspect: boolean;
  targetBytes: number;
};

export type ProcessedBanner = { data: Buffer; width: number; height: number; bytes: number; notes: string[] };

export async function processBannerImage(input: Buffer, spec: BannerSpec): Promise<ProcessedBanner> {
  // Shortest acceptable height: the minimum width in this shape (with slack; the width check below
  // gives the precise message).
  const img = await inspectImage(input, Math.floor(((spec.minWidth * spec.height) / spec.width) * 0.8));
  const notes: string[] = [];
  const target = spec.width / spec.height;
  const actual = img.width / img.height;
  const shapeOff = Math.abs(actual - target) / target;
  const ideal = `${spec.width}×${spec.height}`;

  if (img.width < spec.minWidth) {
    throw new ImageUploadError(`Image is too narrow (${img.width}×${img.height}). Use at least ${spec.minWidth} pixels wide, ideally ${ideal}.`);
  }
  if (spec.strictAspect && shapeOff > 0.15) {
    throw new ImageUploadError(
      `This section needs a ${ideal} banner (or the same shape, larger). Yours is ${img.width}×${img.height}, so text would be cut off. Please resize it to that shape.`,
    );
  }
  if (shapeOff > 0.02) {
    notes.push(
      spec.strictAspect
        ? `Trimmed slightly at the edges to fit ${ideal} exactly.`
        : `Cropped to the banner shape (${ideal}), keeping the most detailed area; check the preview.`,
    );
  }
  if (img.width < spec.width) notes.push(`Image is ${img.width} pixels wide; ${spec.width} looks sharper on large screens.`);

  // Never enlarge: output at most the upload's own resolution (in the target shape).
  const outWidth = Math.round(Math.min(spec.width, img.width, img.height * target));
  const outHeight = Math.round(outWidth / target);
  const resized = img.open().resize(outWidth, outHeight, {
    fit: "cover",
    position: spec.strictAspect ? "centre" : sharp.strategy.attention,
  });
  // Banners sit on coloured backgrounds; flatten transparency onto white so nothing shows through oddly.
  const flat = img.hasAlpha ? resized.flatten({ background: "#ffffff" }) : resized;
  const data = await encodeWebp(flat, spec.targetBytes);
  return { data, width: outWidth, height: outHeight, bytes: data.length, notes };
}
