import sharp from "sharp";
import { openMedia } from "@/lib/storage";

type Params = { params: Promise<{ key: string[] }> };

/** Width of product photos in emails, at 2× for sharp phone screens. */
const WIDTH = 504;

/**
 * An uploaded product photo as a small JPEG for emails: our uploads are WebP, which Outlook
 * can't show. Same keys as /api/media; files never change, so it is cached for a year.
 */
export async function GET(_req: Request, { params }: Params) {
  const key = (await params).key.join("/");
  if (!key.startsWith("image/")) return new Response("Not found", { status: 404 });
  const media = await openMedia(key);
  if (!media) return new Response("Not found", { status: 404 });

  const chunks: Buffer[] = [];
  for await (const chunk of media.stream()) chunks.push(chunk as Buffer);
  const jpeg = await sharp(Buffer.concat(chunks))
    .rotate()
    .resize({ width: WIDTH, height: WIDTH, fit: "cover", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(jpeg.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
