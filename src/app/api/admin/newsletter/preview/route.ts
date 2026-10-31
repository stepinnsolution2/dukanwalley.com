import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/authz";
import { renderEmail } from "@/lib/email-layout";
import { MARKET_CODES, type MarketCode } from "@/lib/markets";
import { buildNewsletterContent } from "@/lib/newsletters";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().max(120),
  template: z.string().max(40),
  subject: z.string().max(200),
  preheader: z.string().max(200),
  content: z.record(z.string().max(40), z.union([z.string().max(5000), z.array(z.string().max(40)).max(12)])),
  market: z.enum(MARKET_CODES as [string, ...string[]]),
  personalPicks: z.boolean(),
});

/** The newsletter as HTML for the editor's live preview (unsaved changes included). */
export async function POST(req: Request) {
  const authz = await requirePermission("newsletter:view");
  if (!authz.ok) return authz.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft" }, { status: 400 });
  const content = await buildNewsletterContent({ ...parsed.data, market: parsed.data.market as MarketCode });
  return NextResponse.json({ html: renderEmail(content).html });
}
