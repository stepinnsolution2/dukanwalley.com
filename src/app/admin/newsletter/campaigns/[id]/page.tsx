import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { SlotValues } from "@/lib/newsletter-templates";
import { audienceWhere } from "@/lib/newsletters";
import { CampaignEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, session] = await Promise.all([prisma.newsletterCampaign.findUnique({ where: { id } }), auth()]);
  if (!campaign) notFound();
  const audience = await prisma.newsletterSubscriber.count({ where: audienceWhere(campaign.market) });
  return (
    <CampaignEditor
      initial={{
        id: campaign.id,
        name: campaign.name,
        template: campaign.template,
        subject: campaign.subject,
        preheader: campaign.preheader,
        content: (campaign.content ?? {}) as SlotValues,
        market: campaign.market,
        personalPicks: campaign.personalPicks,
        status: campaign.status,
        recipients: campaign.recipients,
        sentCount: campaign.sentCount,
        failedCount: campaign.failedCount,
      }}
      audience={audience}
      myEmail={session?.user?.email ?? ""}
    />
  );
}
