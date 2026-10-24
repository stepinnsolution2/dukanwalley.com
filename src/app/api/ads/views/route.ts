import { NextResponse } from "next/server";
import { z } from "zod";
import { isBot, recordAdEvents } from "@/lib/ads";

// Sent by the ad rotator when a banner has actually been on screen (once per banner per page view).
const bodySchema = z.object({ ids: z.array(z.string().max(40)).min(1).max(10) });

export async function POST(req: Request) {
  if (isBot(req.headers.get("user-agent"))) return NextResponse.json({ ok: true, counted: 0 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const counted = await recordAdEvents(parsed.data.ids, "impressions");
  return NextResponse.json({ ok: true, counted });
}
