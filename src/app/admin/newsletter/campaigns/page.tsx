import Link from "next/link";
import { prisma } from "@/lib/db";
import { marketingEmailsLeftToday, marketingSettings } from "@/lib/marketing";
import { getTemplate, NEWSLETTER_TEMPLATES } from "@/lib/newsletter-templates";
import { audienceWhere } from "@/lib/newsletters";
import { NewCampaign } from "./new-campaign";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-zinc-100 text-zinc-700" },
  QUEUING: { label: "Starting", className: "bg-amber-50 text-amber-800" },
  SENDING: { label: "Sending", className: "bg-amber-50 text-amber-800" },
  SENT: { label: "Sent", className: "bg-teal-50 text-teal-800" },
  CANCELLED: { label: "Stopped", className: "bg-red-50 text-red-700" },
};

export default async function CampaignsPage() {
  const [campaigns, audience, settings, left] = await Promise.all([
    prisma.newsletterCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.newsletterSubscriber.count({ where: audienceWhere("PK") }),
    marketingSettings(),
    marketingEmailsLeftToday(),
  ]);
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Newsletters</h1>
        <p className="text-sm text-zinc-600">
          Pick a template, fill in its slots (or use a festival preset), preview it, send yourself a test, then send it to{" "}
          {audience} newsletter subscriber{audience === 1 ? "" : "s"} in Pakistan. Each reader also gets products picked from their own
          cart and browsing.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Up to {settings.dailyLimit} marketing emails go out per day ({left} left today); bigger lists are spread over the following
          days automatically. Change the limit in Settings › Email marketing.
        </p>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Start a newsletter</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {NEWSLETTER_TEMPLATES.map((t) => (
            <NewCampaign key={t.id} template={{ id: t.id, name: t.name, description: t.description }} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white">
        <h2 className="border-b border-zinc-200 px-4 py-3 font-semibold">Your newsletters</h2>
        {campaigns.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Template</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Sent</th>
                  <th className="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {campaigns.map((c) => {
                  const s = STATUS[c.status] ?? STATUS.DRAFT;
                  return (
                    <tr key={c.id}>
                      <td className="px-4 py-2">
                        <Link href={`/admin/newsletter/campaigns/${c.id}`} className="font-medium text-teal-800 hover:underline">
                          {c.name}
                        </Link>
                        {c.subject ? <span className="block text-xs text-zinc-500">{c.subject}</span> : null}
                      </td>
                      <td className="px-4 py-2 text-zinc-600">{getTemplate(c.template).name}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs ${s.className}`}>{s.label}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-zinc-700">
                        {c.status === "DRAFT" ? "—" : `${c.sentCount} / ${c.recipients}`}
                        {c.failedCount ? <span className="block text-xs text-red-600">{c.failedCount} failed</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-zinc-600">{day.format(c.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-zinc-500">No newsletters yet. Start one from a template above.</p>
        )}
      </section>
    </div>
  );
}
