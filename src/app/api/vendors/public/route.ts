import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Vendors eligible to receive catalog uploads from sales. */
export async function GET() {
  const vendors = await prisma.vendorProfile.findMany({
    where: {
      restriction: { not: "FULL_SUSPEND" },
      kycStatus: "APPROVED",
    },
    select: {
      id: true,
      storeName: true,
      market: true,
      restriction: true,
      taxRegNo: true,
    },
    orderBy: { storeName: "asc" },
  });
  return NextResponse.json({
    // Public: say whether the vendor charges tax, never the registration number itself.
    vendors: vendors
      .filter((v) => v.restriction !== "SUSPEND_SELLING")
      .map(({ taxRegNo, ...v }) => ({ ...v, taxRegistered: !!taxRegNo })),
  });
}
