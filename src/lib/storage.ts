import { createReadStream, createWriteStream } from "fs";
import { mkdir, open, rename, rm, stat } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

// Media storage for product images/videos. Files live on local disk under UPLOAD_DIR and are
// served by /api/media/[...key]. On hosts without a persistent disk (e.g. serverless),
// replace this module with an object-storage implementation of the same functions.

export type MediaKind = "image" | "video";

export const MEDIA_LIMITS: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024,
  video: 200 * 1024 * 1024,
};

/** Formats we accept, identified by their leading bytes (never by the client's claim). */
const SIGNATURES: { kind: MediaKind; ext: string; type: string; test: (b: Buffer) => boolean }[] = [
  { kind: "image", ext: "jpg", type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { kind: "image", ext: "png", type: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { kind: "image", ext: "gif", type: "image/gif", test: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  { kind: "image", ext: "webp", type: "image/webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { kind: "video", ext: "webm", type: "video/webm", test: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  // ISO base media (mp4/mov): "ftyp" box at offset 4; QuickTime brand → mov.
  { kind: "video", ext: "mov", type: "video/quicktime", test: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" && b.subarray(8, 10).toString("latin1") === "qt" },
  { kind: "video", ext: "mp4", type: "video/mp4", test: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" },
];

const TYPE_BY_EXT = Object.fromEntries(SIGNATURES.map((s) => [s.ext, s.type]));

export class UploadError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));
}

export function mediaUrl(key: string) {
  return `/api/media/${key}`;
}

/** True for URLs we issued (media stored here), used to accept relative media paths in forms. */
export function isStoredMediaUrl(url: string) {
  return /^\/api\/media\/[a-z]+\/\d{6}\/[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(url);
}

/**
 * Streams an upload to disk without buffering it in memory, enforcing the size limit and
 * checking the file's real format. Returns the public URL.
 */
export async function saveUpload(body: ReadableStream<Uint8Array>, kind: MediaKind) {
  const root = uploadRoot();
  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  const dir = path.join(root, kind, month);
  await mkdir(dir, { recursive: true });
  const id = randomBytes(12).toString("base64url");
  const tmp = path.join(dir, `${id}.part`);

  const limit = MEDIA_LIMITS[kind];
  let size = 0;
  const source = Readable.fromWeb(body as import("stream/web").ReadableStream<Uint8Array>);
  source.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > limit) source.destroy(new UploadError(`File is larger than ${limit / 1024 / 1024} MB`, 413));
  });
  try {
    await pipeline(source, createWriteStream(tmp));
    if (size === 0) throw new UploadError("Empty file");

    const fh = await open(tmp, "r");
    const head = Buffer.alloc(16);
    await fh.read(head, 0, 16, 0);
    await fh.close();
    const sig = SIGNATURES.find((s) => s.kind === kind && s.test(head));
    if (!sig) {
      throw new UploadError(
        kind === "image" ? "Images must be JPEG, PNG, WebP or GIF" : "Videos must be MP4, MOV or WebM",
        415,
      );
    }
    const key = `${kind}/${month}/${id}.${sig.ext}`;
    await rename(tmp, path.join(root, key));
    return { url: mediaUrl(key), size, type: sig.type };
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

/** Resolves a media key to a file inside the upload root (rejecting path traversal). */
export async function openMedia(key: string) {
  if (!/^(image|video)\/\d{6}\/[A-Za-z0-9_-]+\.[a-z0-9]+$/.test(key)) return null;
  const root = uploadRoot();
  const file = path.join(root, key);
  if (!file.startsWith(root + path.sep)) return null;
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return null;
  const type = TYPE_BY_EXT[path.extname(file).slice(1)] ?? "application/octet-stream";
  return {
    size: info.size,
    type,
    stream: (range?: { start: number; end: number }) => createReadStream(file, range),
  };
}
