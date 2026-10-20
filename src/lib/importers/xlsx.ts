import { inflateRawSync } from "zlib";

// Minimal .xlsx reader for supplier exports: the first sheet as rows of strings.
// An .xlsx file is a zip of XML parts; this reads only what a plain data sheet needs
// (shared and inline strings, numbers), not formulas' logic, styles or dates.

/** Reads every file of a zip archive into memory (supplier exports are small). */
function unzip(buf: Buffer): Map<string, Buffer> {
  // End of central directory: signature 0x06054b50, within the last 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not an .xlsx file (no zip directory found)");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Corrupt .xlsx file");
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    // Data starts after the local header, whose name/extra lengths can differ from the central ones.
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compressed);
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, inflateRawSync(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

/** All text runs inside an element (a rich-text cell has several <t>). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

/** "AB12" → 27 (zero-based column). */
function columnIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

/** First worksheet of an .xlsx file as rows of cell strings (missing cells are ""). */
export function readFirstSheet(file: Buffer): string[][] {
  const files = unzip(file);
  const xml = (name: string) => files.get(name)?.toString("utf8");

  const shared = [...(xml("xl/sharedStrings.xml") ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  // workbook.xml lists sheets in order; its rels file maps each to a part path.
  const workbook = xml("xl/workbook.xml") ?? "";
  const rid = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const rels = xml("xl/_rels/workbook.xml.rels") ?? "";
  const target = rid ? [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`)) : undefined;
  const path = target?.match(/Target="([^"]+)"/)?.[1]?.replace(/^\/?(xl\/)?/, "xl/") ?? "xl/worksheets/sheet1.xml";
  const sheet = xml(path);
  if (!sheet) throw new Error("The .xlsx file has no worksheet");

  const rows: string[][] = [];
  for (const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const value =
        type === "s" ? (shared[Number(v)] ?? "") : type === "inlineStr" ? textOf(inner) : v !== undefined ? decode(v) : "";
      cells[ref ? columnIndex(ref) : cells.length] = value;
    }
    rows.push(Array.from(cells, (x) => x ?? ""));
  }
  return rows;
}
