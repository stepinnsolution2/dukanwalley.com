import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isMarketCode, MARKET_CODES, MARKETS } from "@/lib/markets";
import { can } from "@/lib/permissions";
import { KycStatus, VendorRestriction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { CreateVendor } from "./create-vendor";

export const dynamic = "force-dynamic";

type Search = { market?: string; kyc?: string; restriction?: string; q?: string };

const badge = (tone: string) => `inline-block rounded px-2 py-0.5 text-xs font-medium ${tone}`;
const kycTone: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

export default async function AdminVendorsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const session = await auth();
  const q = sp.q?.trim();
  const where: Prisma.VendorProfileWhereInput = {
    ...(isMarketCode(sp.market) ? { market: sp.market } : {}),
    ...(sp.kyc && sp.kyc in KycStatus ? { kycStatus: sp.kyc as KycStatus } : {}),
    ...(sp.restriction && sp.restriction in VendorRestriction ? { restriction: sp.restriction as VendorRestriction } : {}),
    ...(q
      ? {
          OR: [
            { storeName: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
            { user: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const vendors = await prisma.vendorProfile.findMany({
    where,
    include: {
      user: { select: { email: true } },
      _count: { select: { products: true, orderItems: true } },
    },
    orderBy: [{ kycStatus: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const field = "rounded border px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Vendors</h1>
        {can(session?.user?.role, "vendors:manage") ? <CreateVendor /> : null}
      </div>
      <form method="get" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Store or email" className={field} />
        <select name="market" defaultValue={sp.market ?? ""} className={field}>
          <option value="">All countries</option>
          {MARKET_CODES.map((c) => <option key={c} value={c}>{MARKETS[c].name}</option>)}
        </select>
        <select name="kyc" defaultValue={sp.kyc ?? ""} className={field}>
          <option value="">Any KYC</option>
          {Object.values(KycStatus).map((k) => <option key={k} value={k}>{k.toLowerCase()}</option>)}
        </select>
        <select name="restriction" defaultValue={sp.restriction ?? ""} className={field}>
          <option value="">Any restriction</option>
          {Object.values(VendorRestriction).map((r) => <option key={r} value={r}>{r.toLowerCase().replace("_", " ")}</option>)}
        </select>
        <button className="rounded bg-teal-700 px-3 py-1.5 text-sm text-white">Filter</button>
        <Link href="/admin/vendors" className="px-2 py-1.5 text-sm text-zinc-600 underline">Clear</Link>
      </form>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">KYC</th>
              <th className="px-4 py-3">Restriction</th>
              <th className="px-4 py-3">Products</th>
              <th className="px-4 py-3">Order lines</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id} className="border-b border-zinc-100">
                <td className="px-4 py-3">
                  <Link href={`/admin/vendors/${v.id}`} className="font-medium text-teal-800 hover:underline">{v.storeName}</Link>
                  {v.displayName ? <span className="block text-xs text-zinc-500">shown as {v.displayName}</span> : null}
                  {v.isTopSeller ? <span className={`ml-2 ${badge("bg-amber-100 text-amber-800")}`}>Top seller</span> : null}
                  <span className="block text-xs text-zinc-500">{v.user.email}</span>
                </td>
                <td className="px-4 py-3">{MARKETS[v.market].name}</td>
                <td className="px-4 py-3"><span className={badge(kycTone[v.kycStatus])}>{v.kycStatus.toLowerCase()}</span></td>
                <td className="px-4 py-3">
                  {v.restriction === "NONE" ? "—" : <span className={badge("bg-red-100 text-red-800")}>{v.restriction.toLowerCase().replace("_", " ")}</span>}
                </td>
                <td className="px-4 py-3">{v._count.products}</td>
                <td className="px-4 py-3">{v._count.orderItems}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {vendors.length === 0 ? <p className="text-sm text-zinc-500">No vendors match.</p> : null}
    </div>
  );
}
