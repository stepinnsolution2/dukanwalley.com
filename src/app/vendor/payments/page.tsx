import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AccountSummaryCards, AccountThread } from "@/components/account-thread";
import { AccountComposer } from "@/components/account-thread-actions";
import { prisma } from "@/lib/db";
import { MARKETS } from "@/lib/markets";
import { accountSummary, markSeen, threadEntries } from "@/lib/vendor-account";

export const dynamic = "force-dynamic";

/** The vendor's side: balance with DukanWalley, payments received, and messages. */
export default async function VendorPaymentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/vendor/payments");
  if (session.user.role !== "VENDOR") redirect("/");
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: session.user.id }, select: { id: true, storeName: true, market: true } });
  if (!vendor) redirect("/vendor");
  const [summary, entries] = await Promise.all([accountSummary(vendor.id), threadEntries(vendor.id)]);
  await markSeen(vendor.id, "VENDOR");

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-10">
      <div>
        <Link href="/vendor" className="text-sm text-teal-700 hover:underline">
          ← {vendor.storeName}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Payments &amp; messages</h1>
        <p className="text-sm text-zinc-600">
          Your earnings from delivered orders (after DukanWalley&apos;s commission), the payments we&apos;ve sent you, and messages with our
          team. Confirm each payment once it reaches you, or reply here if anything doesn&apos;t match.
        </p>
      </div>
      <AccountSummaryCards s={summary} market={vendor.market} viewer="VENDOR" />
      <AccountThread entries={entries} market={vendor.market} viewer="VENDOR" vendorName={vendor.storeName} />
      <AccountComposer endpoint="/api/vendor/account" canPay={false} currency={MARKETS[vendor.market].currency} />
    </main>
  );
}
