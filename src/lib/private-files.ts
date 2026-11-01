// Private files (payment screenshots, receipts) attached to vendor account entries. Stored apart
// from product media and never served by /api/media; /api/account-files checks who is asking.
import { randomBytes } from "crypto";
import { createReadStream } from "fs";
import { mkdir, stat, writeFile } from "fs/promises";
import path from "path";
import { UploadError } from "@/lib/storage";

export type PrivateFile = { key: string; name: string; type: string; size: number };

export const PRIVATE_FILE_LIMIT = 10 * 1024 * 1024;
export const MAX_FILES_PER_ENTRY = 5;

const KINDS: { ext: string; type: string; test: (b: Buffer) => boolean }[] = [
  { ext: "jpg", type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", type: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "webp", type: "image/webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { ext: "pdf", type: "application/pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
];

function root() {
  return path.resolve(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"), "private");
}

/** Saves an uploaded receipt/screenshot after checking its real format and size. */
export async function savePrivateFile(file: File): Promise<PrivateFile> {
  if (file.size > PRIVATE_FILE_LIMIT) throw new UploadError(`"${file.name}" is larger than 10 MB`, 413);
  const data = Buffer.from(await file.arrayBuffer());
  if (!data.length) throw new UploadError(`"${file.name}" is empty`);
  const kind = KINDS.find((k) => k.test(data));
  if (!kind) throw new UploadError(`"${file.name}": attach a JPG, PNG, WebP image or a PDF`, 415);
  const month = new Date().toISOString().slice(0, 7).replace("-", "");
  await mkdir(path.join(root(), month), { recursive: true });
  const key = `${month}/${randomBytes(16).toString("base64url")}.${kind.ext}`;
  await writeFile(path.join(root(), key), data);
  const name = file.name.replace(/[^\w.\- ()]+/g, "_").slice(-80) || `file.${kind.ext}`;
  return { key, name, type: kind.type, size: data.length };
}

export async function openPrivateFile(key: string) {
  if (!/^\d{6}\/[A-Za-z0-9_-]+\.(jpg|png|webp|pdf)$/.test(key)) return null;
  const file = path.join(root(), key);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) return null;
  return { size: info.size, stream: () => createReadStream(file) };
}
