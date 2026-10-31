import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { MARKET_CODES } from "@/lib/markets";
import { NEWSLETTER_TEMPLATES } from "@/lib/newsletter-templates";

/** Newsletter campaigns, newest first. */
export async function GET() {
  const authz = await requirePermission("newsletter:view");
  if (!authz.ok) return authz.response;
  const campaigns = await prisma.newsletterCampaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, template: true, subject: true, market: true, status: true, recipients: true, sentCount: true, failedCount: true, createdAt: true, finishedAt: true },
  });
  return NextResponse.json({ campaigns });
}

const createSchema = z.object({
  template: z.enum(NEWSLETTER_TEMPLATES.map((t) => t.id) as [string, ...string[]]),
  name: z.string().trim().min(1).max(120),
  market: z.enum(MARKET_CODES as [string, ...string[]]).default("PK"),
});

/** New draft from a template; every slot starts empty. */
export async function POST(req: Request) {
  const authz = await requirePermission("newsletter:manage");
  if (!authz.ok) return authz.response;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a template and give the newsletter a name" }, { status: 400 });
  const campaign = await prisma.newsletterCampaign.create({
    data: { ...parsed.data, market: parsed.data.market as "PK" | "AE", content: {}, createdById: authz.session.user.id },
  });
  return NextResponse.json({ id: campaign.id });
}
