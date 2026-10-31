// Finds a supplier's branding in a product photo with Claude (vision), so cover-marks.ts can paint
// it out: logos, printed names on cards, stickers and box lids, watermarks, URLs and price tags.
// Used by supplier imports whose photos are too many to mark by hand.
import sharp from "sharp";
import type { Area } from "./cover-marks";

export type BrandScan = {
  /** Areas to paint over (fractions of width/height), padded a little. */
  areas: Area[];
  /** The photo is mostly an advert (big text, banner): don't use it at all. */
  skip: boolean;
};

const MODEL = "claude-haiku-5-5";
const PAD = 0.015;

export async function scanForBranding(photo: Buffer, opts: { apiKey: string; brandNames: string[]; model?: string }): Promise<BrandScan> {
  const jpeg = await sharp(photo).rotate().resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const prompt = `This is a product photo from a supplier (${opts.brandNames.join(" / ")}). We resell the product and must remove the supplier's identity from the photo.

Find every area that shows the supplier's identity or shop-specific text:
- the brand name or logo in any script (e.g. ${opts.brandNames.map((b) => `"${b}"`).join(", ")}), on a card, sticker, tag, box lid, pouch or as a watermark
- any website address, phone number, social media handle or QR code
- price tags or printed prices and product codes overlaid on the photo

Do NOT mark the product itself or plain packaging without text.

Also say whether the photo is mainly an advertisement (large promotional text or a banner layout covering much of the image) rather than a product photo.

Reply with JSON only, no prose:
{"advert": false, "marks": [[left, top, right, bottom], ...]}
Coordinates are fractions of the image width and height (0 to 1), each box tightly around one mark. Use "marks": [] if there is none.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: opts.model ?? MODEL,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${body?.error?.message ?? "error"}`);
  const text = body?.content?.filter((b) => b.type === "text").map((b) => b.text).join("") ?? "";
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`unreadable reply: ${text.slice(0, 120)}`);
  const parsed = JSON.parse(json) as { advert?: boolean; marks?: unknown };
  const areas: Area[] = [];
  for (const m of Array.isArray(parsed.marks) ? parsed.marks : []) {
    if (!Array.isArray(m) || m.length !== 4 || !m.every((n) => typeof n === "number" && n >= 0 && n <= 1)) continue;
    const [l, t, r, b] = m as number[];
    if (r <= l || b <= t) continue;
    areas.push([Math.max(0, l - PAD), Math.max(0, t - PAD), Math.min(1, r + PAD), Math.min(1, b + PAD)]);
  }
  // A mark covering most of the photo can't be painted out convincingly.
  const big = areas.some(([l, t, r, b]) => (r - l) * (b - t) > 0.35);
  return { areas, skip: !!parsed.advert || big };
}
