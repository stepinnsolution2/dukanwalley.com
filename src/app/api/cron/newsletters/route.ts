import { NextResponse } from "next/server";
import { processNewsletterQueue } from "@/lib/newsletters";

/**
 * Sends the next batch of queued newsletters, within the daily marketing limit.
 * Run every 10 minutes with header `x-cron-secret: $CRON_SECRET`.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(await processNewsletterQueue());
}
