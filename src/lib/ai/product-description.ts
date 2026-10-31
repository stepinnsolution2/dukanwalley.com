// Writes detailed, original product descriptions with Claude from a product's own facts and photos.
// The supplier's text is input only: the model is told to restate facts in its own words, and the
// result is rejected if it names the supplier or invents things we can't stand behind (returns,
// warranties). The owner's Anthropic key comes from Admin › Settings › AI product descriptions.
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { attributeNameLookup } from "@/lib/catalog";
import { integrationSettings } from "@/lib/integration-settings";
import { deliveryRegions, MARKETS } from "@/lib/markets";
import { SITE_NAME } from "@/lib/seo";
import { openMedia } from "@/lib/storage";
import { publicStoreName } from "@/lib/vendor-slug";
import { variantLabel, type VariantOptions } from "@/lib/variants";

export class DescriptionError extends Error {}

const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_IMAGES = 3;
/** Words that must never reach shoppers: suppliers we import from. */
const BLOCKED = [/markaz/i, /rawayat/i, /روایت/, /haseeb\s*sarwar/i];

export async function aiDescriptionsConfigured() {
  return !!(await integrationSettings()).ANTHROPIC_API_KEY;
}

/** Our photos, shrunk to what the model needs, as base64 JPEG. */
async function photo(url: string) {
  const key = url.replace(/^\/api\/media\//, "").split("?")[0];
  const file = await openMedia(key);
  if (!file) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of file.stream()) chunks.push(chunk as Buffer);
  const jpeg = await sharp(Buffer.concat(chunks)).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return jpeg.toString("base64");
}

const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function loadFacts(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: MAX_IMAGES },
      variants: true,
      vendor: { select: { storeName: true, displayName: true, market: true } },
      category: { include: { parent: { include: { parent: true } } } },
    },
  });
  if (!product) throw new DescriptionError("Product not found");
  const names = (await attributeNameLookup())(product.categoryId);
  const c = product.category;
  const categoryPath = [c.parent?.parent?.name, c.parent?.name, c.name].filter(Boolean).join(" › ");
  const details = Object.entries((product.metadata as Record<string, unknown> | null) ?? {})
    .filter(([, v]) => v !== "" && v != null)
    .map(([k, v]) => `${names[k] ?? k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  const options = product.variants
    .map((v) => variantLabel(v.options as VariantOptions, names))
    .filter(Boolean);
  // The supplier's text is kept the first time we replace it, so it stays the input on re-runs.
  const sourceText = product.sourceDescription ?? (product.descriptionWrittenAt ? null : product.description);
  return { product, categoryPath, details, options, sourceText };
}

function buildPrompt(f: Awaited<ReturnType<typeof loadFacts>>) {
  const m = MARKETS[f.product.vendor.market];
  const areas = deliveryRegions(m).map((r) => r.replace(" Capital Territory", "")).join(", ");
  const facts = [
    `Product name: ${f.product.name}`,
    `Category: ${f.categoryPath}`,
    f.details.length ? `Listed details:\n- ${f.details.join("\n- ")}` : null,
    f.options.length ? `Options a shopper can choose: ${[...new Set(f.options)].join("; ")}` : null,
    f.sourceText ? `Supplier's notes (facts only; may be poorly written or contain errors):\n"""\n${strip(f.sourceText).slice(0, 4000)}\n"""` : null,
  ].filter(Boolean);
  const store =
    f.product.vendor.market === "PK"
      ? `Shop facts you may state: sold on ${SITE_NAME} (an online marketplace in Pakistan) by the seller "${publicStoreName(f.product.vendor)}"; free delivery to ${areas}; delivery usually within 3 working days; cash on delivery is available (the buyer confirms the order by link within 48 hours).`
      : `Shop facts you may state: sold on ${SITE_NAME} by the seller "${publicStoreName(f.product.vendor)}" in the ${m.name}.`;

  return `Write the product description for this listing on ${SITE_NAME}.

${facts.join("\n\n")}

${store}

The photos attached show the product.

Rules:
- Write everything in your own words. Never copy sentences or phrases from the supplier's notes; use them only as a source of facts.
- State only facts from the details above or things clearly visible in the photos (colour, pattern, style, shape). If a fact is uncertain, leave it out. Never invent materials, measurements, specifications, brand claims, certifications, warranties, "original/authentic" claims, return or refund terms, discounts or prices.
- Never mention any supplier, wholesaler, factory, other website, China or importing. Don't mention AI.
- Simple, friendly English for shoppers in Pakistan. Use natural search phrases a shopper would type (the product type, "online in Pakistan", common local names such as kurti, shalwar kameez, lawn, chappal where they truly fit), at most twice each. No keyword lists, no emojis, no exclamation marks, no prices.
- 350 to 600 words.

Format: Markdown only, exactly these parts, in this order, and nothing before or after:
1. Two or three short opening paragraphs (no heading): what it is, who it suits, what stands out.
2. "## Key features": 5 to 8 bullet points.
3. "## Specifications": bullet points "**Label:** value", only for facts you were given or can see (for example colour, sizes, type). Skip anything unknown.
4. "## How to wear it" for clothing, shoes and accessories, or "## How to use it" for other products: one short paragraph of practical ideas.
5. "## Care tips": 3 to 5 bullet points of general care suited to this type of product. Only mention a material if it was given.
6. "## Delivery and payment": one short paragraph using only the shop facts above.
7. "## Frequently asked questions": 3 to 5 questions as "### Question?" followed by a short answer, based only on the facts above. If the honest answer is unknown (for example exact measurements), say to check the size options and photos or contact us.`;
}

function check(text: string, f: Awaited<ReturnType<typeof loadFacts>>) {
  const t = text.trim().replace(/^```(?:markdown)?\s*|\s*```$/g, "");
  if (t.length < 900 || !t.includes("## Key features") || !t.includes("## Frequently asked questions")) {
    throw new DescriptionError("The AI reply wasn't a complete description; try again");
  }
  const hidden = f.product.vendor.displayName ? [f.product.vendor.storeName] : [];
  const leak = [...BLOCKED.filter((re) => re.test(t)).map(String), ...hidden.filter((n) => t.toLowerCase().includes(n.toLowerCase()))];
  if (leak.length) throw new DescriptionError(`The AI reply mentioned ${leak.join(", ")}; try again`);
  if (/\b(\d+[- ]day returns?|money[- ]back|warranty|guarantee)/i.test(t) && !/warranty|guarantee/i.test(f.sourceText ?? "")) {
    throw new DescriptionError("The AI reply promised returns or a warranty we haven't confirmed; try again");
  }
  return t;
}

/** Writes a description for one product. Doesn't save it. */
export async function writeProductDescription(productId: string): Promise<{ description: string; sourceText: string | null }> {
  const settings = await integrationSettings();
  const apiKey = settings.ANTHROPIC_API_KEY;
  if (!apiKey) throw new DescriptionError("Add your Anthropic API key in Admin › Settings › AI product descriptions first");
  const f = await loadFacts(productId);
  const photos = (await Promise.all(f.product.images.map((i) => photo(i.url).catch(() => null)))).filter(Boolean) as string[];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: settings.AI_DESCRIPTION_MODEL || DEFAULT_MODEL,
      max_tokens: 2000,
      system: `You write accurate, original, search-friendly product descriptions for ${SITE_NAME}, an online marketplace in Pakistan.`,
      messages: [
        {
          role: "user",
          content: [
            ...photos.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
            { type: "text", text: buildPrompt(f) },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; error?: { message?: string } } | null;
  if (!res.ok) {
    const why = body?.error?.message ?? `HTTP ${res.status}`;
    throw new DescriptionError(res.status === 401 ? "Anthropic rejected the API key" : `Anthropic error: ${why}`);
  }
  const text = body?.content?.filter((b) => b.type === "text").map((b) => b.text).join("") ?? "";
  return { description: check(text, f), sourceText: f.sourceText };
}

/** Writes and saves a description, keeping the supplier's original text for later re-writes. */
export async function writeAndSaveDescription(productId: string) {
  const { description, sourceText } = await writeProductDescription(productId);
  await prisma.product.update({
    where: { id: productId },
    data: { description, descriptionWrittenAt: new Date(), ...(sourceText ? { sourceDescription: sourceText } : {}) },
  });
  return description;
}

// --- Bulk runs (one at a time per server process) -----------------------------------------------

type BulkState = { running: boolean; total: number; done: number; failed: { id: string; error: string }[] };
const g = globalThis as unknown as { __aiBulk?: BulkState };
export function bulkDescriptionState(): BulkState {
  return g.__aiBulk ?? { running: false, total: 0, done: 0, failed: [] };
}

/** Writes descriptions for these products one by one in the background. */
export async function runBulkDescriptions(ids: string[]) {
  if (g.__aiBulk?.running) throw new DescriptionError("A bulk run is already in progress");
  const state: BulkState = { running: true, total: ids.length, done: 0, failed: [] };
  g.__aiBulk = state;
  try {
    for (const id of ids) {
      try {
        await writeAndSaveDescription(id);
      } catch (e) {
        state.failed.push({ id, error: e instanceof Error ? e.message : String(e) });
        // A bad key or empty balance fails every product: stop instead of repeating it.
        if (e instanceof DescriptionError && /API key|credit|balance/i.test(e.message)) break;
      }
      state.done++;
    }
  } finally {
    state.running = false;
  }
}
