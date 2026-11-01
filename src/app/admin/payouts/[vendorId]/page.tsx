import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { AccountSummaryCards, AccountThread } from "@/components/account-thread";
import { AccountComposer } from "@/components/account-thread-actions";
import { prisma } from "@/lib/db";
import { MARKETS } from "@/lib/markets";
import { can } from "@/lib/permissions";
import { accountSummary, markSeen, threadEntries } from "@/lib/vendor-account";

export const dynamic = "force-dynamic";

export default async function VendorAccountPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: vendorId },
    select: { id: true, storeName: true, displayName: true, phone: true, market: true, user: { select: { email: true } } },
  });
  if (!vendor) notFound();
  const [session, summary, entries] = await Promise.all([auth(), accountSummary(vendorId), threadEntries(vendorId)]);
  await markSeen(vendorId, "ADMIN");
  const canManage = can(session?.user?.role, "payouts:manage");
  const canEmail = !/\.internal$/i.test(vendor.user.email);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/payouts" className="text-sm text-teal-700 hover:underline">
          ← Vendor payments
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{vendor.storeName}</h1>
        <p className="text-sm text-zinc-600">
          {vendor.displayName && vendor.displayName !== vendor.storeName ? `Shown as ${vendor.displayName} · ` : ""}
          {vendor.phone}
          {canEmail ? ` · ${vendor.user.email}` : ""} ·{" "}
          <Link href={`/admin/vendors/${vendor.id}`} className="text-teal-700 hover:underline">
            Store details
          </Link>{" "}
          ·{" "}
          <Link href={`/admin/commission?vendor=${vendor.id}&range=all&status=delivered&market=${vendor.market}`} className="text-teal-700 hover:underline">
            Delivered orders
          </Link>
        </p>
      </div>
      <AccountSummaryCards s={summary} market={vendor.market} viewer="ADMIN" />
      {!canEmail ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This store has no login of its own yet, so the vendor can&apos;t see this thread or get emails about it. Set their login in Vendors › Store
          login to give them access; until then, use it as your own payment record.
        </p>
      ) : null}
      <AccountThread entries={entries} market={vendor.market} viewer="ADMIN" canManage={canManage} vendorName={vendor.storeName} />
      {canManage ? <AccountComposer endpoint={`/api/admin/payouts/${vendor.id}`} canPay currency={MARKETS[vendor.market].currency} /> : null}
    </div>
  );
}
