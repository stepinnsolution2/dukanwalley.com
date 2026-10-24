import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isBot, recordAdEvents } from "@/lib/ads";
import { SITE_URL } from "@/lib/seo";

type Params = { params: Promise<{ id: string }> };

/** Counts a click on an ad, then forwards to that booking's own link (never a link from the URL). */
export async function GET(req: Request, { params }: Params) {
  const ad = await prisma.adBanner.findUnique({ where: { id: (await params).id }, select: { id: true, linkUrl: true } });
  const target = ad?.linkUrl && /^(https?:\/\/|\/(?!\/))/.test(ad.linkUrl) ? ad.linkUrl : "/";
  if (ad?.linkUrl && !isBot(req.headers.get("user-agent"))) await recordAdEvents([ad.id], "clicks");
  // Relative links resolve against the public site (behind Nginx, req.url is plain http).
  return NextResponse.redirect(new URL(target, SITE_URL), 302);
}
