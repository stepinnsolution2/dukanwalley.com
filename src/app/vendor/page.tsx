import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { unreadCount } from "@/lib/vendor-account";

export const dynamic = "force-dynamic";

export default async function VendorDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/vendor");
  if (session.user.role !== "VENDOR") redirect("/");

  const profile = await prisma.vendorProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      products: {
        select: { name: true, approvalStatus: true, availableForSale: true },
      },
    },
  });

  if (!profile) {
    return <p className="p-6">No vendor profile.</p>;
  }
  const unread = await unreadCount(profile.id, "VENDOR");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{profile.storeName}</h1>
        <SignOutButton className="text-sm font-medium text-zinc-700 hover:text-red-700" />
      </div>
      <p className="mt-2 text-sm text-zinc-600">
        KYC: <strong>{profile.kycStatus}</strong> · Restriction:{" "}
        <strong>{profile.restriction}</strong>
      </p>
      <p className="mt-4 text-sm">{profile.addressLine1}</p>
      <Link
        href="/vendor/payments"
        className="mt-6 flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm hover:bg-teal-100"
      >
        <span>
          <strong className="block text-teal-900">💸 Payments &amp; messages</strong>
          <span className="text-teal-800">Your balance with DukanWalley, payments received and messages with our team</span>
        </span>
        {unread ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{unread} new</span> : null}
      </Link>
      <h2 className="mt-8 font-semibold">Products</h2>
      <ul className="mt-2 list-inside list-disc text-sm text-zinc-700">
        {profile.products.map((p, i) => (
          <li key={i}>
            {p.name} — {p.approvalStatus}
            {p.availableForSale ? " · for sale" : ""}
          </li>
        ))}
      </ul>
    </main>
  );
}
