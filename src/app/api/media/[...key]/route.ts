import { Readable } from "stream";
import { openMedia } from "@/lib/storage";

type Params = { params: Promise<{ key: string[] }> };

/**
 * Serves uploaded product media. Supports HTTP Range so videos can seek (Safari requires it).
 * File names are random and immutable, so responses are cached for a year.
 */
export async function GET(req: Request, { params }: Params) {
  const { key } = await params;
  const media = await openMedia(key.join("/"));
  if (!media) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": media.type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  };

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : media.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : media.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, media.size - 1);
    if (start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${media.size}` } });
    }
    const body = Readable.toWeb(media.stream({ start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${media.size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const body = Readable.toWeb(media.stream()) as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(media.size) } });
}
