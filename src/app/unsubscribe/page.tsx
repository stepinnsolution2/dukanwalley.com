import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { prisma } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/marketing";
import { PAGE_FORM } from "@/lib/page-layout";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email preferences", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | undefined>> };

/**
 * Landing page for the "Unsubscribe" link in marketing emails. Opening it changes nothing
 * (mail scanners open links); the button posts to /api/unsubscribe.
 */
export default async function UnsubscribePage({ searchParams }: Props) {
  const sp = await searchParams;
  const email = sp.e ?? "";
  const token = sp.t ?? "";
  const valid = !!email && verifyUnsubscribeToken(email, token);
  const sub = valid ? await prisma.newsletterSubscriber.findUnique({ where: { email: email.toLowerCase() }, select: { status: true } }) : null;
  const unsubscribed = sp.done === "unsubscribed" || (sp.done !== "resubscribed" && sub?.status === "UNSUBSCRIBED");
  const action = (a: "unsubscribe" | "resubscribe") =>
    `/api/unsubscribe?${new URLSearchParams({ e: email, t: token, action: a, from: "page" })}`;

  return (
    <>
      <SiteHeader />
      <main className={PAGE_FORM}>
        <h1 className="text-2xl font-semibold">Email preferences</h1>
        {!valid ? (
          <p className="mt-4 text-zinc-700">This link isn&apos;t valid. Please use the Unsubscribe link from our latest email.</p>
        ) : unsubscribed ? (
          <div className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
            <p className="text-zinc-800">
              <strong>{email}</strong> is unsubscribed. You won&apos;t get newsletters or cart reminders from DukanWalley any more.
            </p>
            <p className="text-sm text-zinc-600">You&apos;ll still get emails about orders you place, such as confirmations and delivery updates.</p>
            <form method="post" action={action("resubscribe")}>
              <button className="rounded-lg border border-teal-700 px-4 py-2 text-sm font-medium text-teal-800">Changed your mind? Subscribe again</button>
            </form>
            <Link href="/products" className="inline-block text-sm text-teal-700 underline">
              Continue shopping
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
            {sp.done === "resubscribed" ? <p className="text-sm font-medium text-green-700">Welcome back! You&apos;re subscribed again.</p> : null}
            <p className="text-zinc-800">
              You&apos;re getting deals, new arrivals and cart reminders at <strong>{email}</strong>.
            </p>
            <form method="post" action={action("unsubscribe")}>
              <button className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white">Unsubscribe from these emails</button>
            </form>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
