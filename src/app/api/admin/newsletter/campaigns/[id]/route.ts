import { after, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { sendEmail } from "@/lib/email";
import { MARKET_CODES, type MarketCode } from "@/lib/markets";
import { unsubscribeLinks } from "@/lib/marketing";
import { missingForSend, type SlotValues } from "@/lib/newsletter-templates";
import { audienceWhere, buildNewsletterContent, processNewsletterQueue, queueCampaign, refreshCampaignCounts } from "@/lib/newsletters";

type Params = { params: Promise<{ id: string }> };

/** A campaign, how many subscribers it would go to, and its send log summary. */
export async function GET(_req: Request, { params }: Params) {
  const authz = await requirePermission("newsletter:view");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status === "SENDING") await refreshCampaignCounts(id);
  const [audience, fresh] = await Promise.all([
    prisma.newsletterSubscriber.count({ where: audienceWhere(campaign.market) }),
    prisma.newsletterCampaign.findUniqueOrThrow({ where: { id } }),
  ]);
  return NextResponse.json({ campaign: fresh, audience });
}

const slotValue = z.union([z.string().max(5000), z.array(z.string().max(40)).max(12)]);
const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  subject: z.string().max(200).optional(),
  preheader: z.string().max(200).optional(),
  content: z.record(z.string().max(40), slotValue).optional(),
  market: z.enum(MARKET_CODES as [string, ...string[]]).optional(),
  personalPicks: z.boolean().optional(),
});

/** Saves a draft. Sent campaigns can't be changed. */
export async function PATCH(req: Request, { params }: Params) {
  const authz = await requirePermission("newsletter:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Some fields are too long" }, { status: 400 });
  const { market, ...rest } = parsed.data;
  const res = await prisma.newsletterCampaign.updateMany({
    where: { id, status: "DRAFT" },
    data: { ...rest, ...(market ? { market: market as MarketCode } : {}) },
  });
  if (!res.count) return NextResponse.json({ error: "Only drafts can be edited" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

/** Deletes a draft (or a finished campaign's record). Not while it is sending. */
export async function DELETE(_req: Request, { params }: Params) {
  const authz = await requirePermission("newsletter:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const res = await prisma.newsletterCampaign.deleteMany({ where: { id, status: { not: "SENDING" } } });
  if (!res.count) return NextResponse.json({ error: "Stop sending first" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("test"), to: z.string().trim().toLowerCase().email() }),
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("duplicate") }),
]);

/** test: send one copy · send: queue for all subscribers · cancel: stop the queue · duplicate. */
export async function POST(req: Request, { params }: Params) {
  const authz = await requirePermission("newsletter:manage");
  if (!authz.ok) return authz.response;
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  const campaign = await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const draft = { ...campaign, content: (campaign.content ?? {}) as SlotValues };
  const body = parsed.data;

  if (body.action === "test") {
    const content = await buildNewsletterContent(draft, body.to);
    try {
      await sendEmail({ to: body.to, subject: `[Test] ${campaign.subject || campaign.name}`, content, listUnsubscribe: unsubscribeLinks(body.to).oneClick });
    } catch (e) {
      return NextResponse.json({ error: `Could not send: ${e instanceof Error ? e.message : e}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "send") {
    if (campaign.status !== "DRAFT") return NextResponse.json({ error: "Already sent" }, { status: 409 });
    const missing = missingForSend(draft);
    if (missing.length) return NextResponse.json({ error: `Fill in: ${missing.join(", ")}` }, { status: 400 });
    // Claim the draft so a double click queues it once.
    const claimed = await prisma.newsletterCampaign.updateMany({ where: { id, status: "DRAFT" }, data: { status: "QUEUING" } });
    if (!claimed.count) return NextResponse.json({ error: "Already sent" }, { status: 409 });
    const recipients = await queueCampaign(id);
    await prisma.auditLog.create({
      data: { userId: authz.session.user.id, action: "NEWSLETTER_SEND", entity: "NewsletterCampaign", entityId: id, meta: { recipients } },
    });
    after(() => processNewsletterQueue().catch((e) => console.error("[newsletter]", e)));
    return NextResponse.json({ ok: true, recipients });
  }

  if (body.action === "cancel") {
    await prisma.newsletterSend.updateMany({ where: { campaignId: id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Cancelled" } });
    await refreshCampaignCounts(id);
    await prisma.newsletterCampaign.updateMany({ where: { id, status: "SENDING" }, data: { status: "CANCELLED", finishedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  const copy = await prisma.newsletterCampaign.create({
    data: {
      name: `${campaign.name} (copy)`,
      template: campaign.template,
      subject: campaign.subject,
      preheader: campaign.preheader,
      content: campaign.content ?? {},
      market: campaign.market,
      personalPicks: campaign.personalPicks,
      createdById: authz.session.user.id,
    },
  });
  return NextResponse.json({ id: copy.id });
}
