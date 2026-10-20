import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/authz";
import { MARKETS, normalizeMobile } from "@/lib/markets";
import { hashPassword } from "@/lib/password";
import type { Permission } from "@/lib/permissions";
import { KycStatus, Market, UserRole, VendorRestriction } from "@/generated/prisma/enums";

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().min(5),
  storeName: z.string().min(2),
  addressLine1: z.string().min(3),
  city: z.string().optional(),
  region: z.string().optional(),
  market: z.nativeEnum(Market),
  nationalId: z.string().optional(),
  businessRegNo: z.string().optional(),
  taxRegNo: z.string().optional(),
  logoUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  kycStatus: z.nativeEnum(KycStatus).optional(),
  commissionOverrideBps: z.number().int().min(0).max(10000).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  kycStatus: z.nativeEnum(KycStatus).optional(),
  verificationNotes: z.string().nullable().optional(),
  nationalId: z.string().nullable().optional(),
  businessRegNo: z.string().nullable().optional(),
  taxRegNo: z.string().nullable().optional(),
  restriction: z.nativeEnum(VendorRestriction).optional(),
  suspendedReason: z.string().nullable().optional(),
  // null clears the override so the vendor falls back to category/global rules.
  commissionOverrideBps: z.number().int().min(0).max(10000).nullable().optional(),
  isTopSeller: z.boolean().optional(),
});

/** Which permission each editable field needs; see src/lib/permissions.ts. */
const fieldPermissions: Record<Exclude<keyof z.infer<typeof patchSchema>, "id">, Permission> = {
  kycStatus: "vendors:manage",
  verificationNotes: "vendors:manage",
  nationalId: "vendors:manage",
  businessRegNo: "vendors:manage",
  taxRegNo: "vendors:manage",
  restriction: "vendors:restrict",
  suspendedReason: "vendors:restrict",
  commissionOverrideBps: "vendors:commission",
  isTopSeller: "vendors:manage",
};

export async function GET() {
  const authz = await requirePermission("vendors:view");
  if (!authz.ok) return authz.response;
  const vendors = await prisma.vendorProfile.findMany({
    include: {
      user: { select: { id: true, email: true, name: true, banned: true } },
      products: { select: { id: true, approvalStatus: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ vendors });
}

export async function POST(req: Request) {
  const staff = await requirePermission();
  if (!staff.ok) return staff.response;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const authz = await requirePermission(
    "vendors:manage",
    ...(d.commissionOverrideBps !== undefined ? (["vendors:commission"] as const) : []),
  );
  if (!authz.ok) return authz.response;

  const m = MARKETS[d.market];
  const phone = normalizeMobile(d.market, d.phone);
  if (!phone) {
    return NextResponse.json(
      { error: `Enter a ${m.name} mobile number, e.g. ${m.mobileExample}` },
      { status: 400 },
    );
  }
  if (d.region && !m.regions.includes(d.region)) {
    return NextResponse.json({ error: `Unknown ${m.regionLabel.toLowerCase()}` }, { status: 400 });
  }
  const exists = await prisma.user.findUnique({ where: { email: d.email } });
  if (exists) {
    return NextResponse.json({ error: "Email taken" }, { status: 409 });
  }
  const passwordHash = await hashPassword(d.password);
  await prisma.user.create({
    data: {
      email: d.email,
      passwordHash,
      name: d.name,
      phone,
      role: UserRole.VENDOR,
      vendorProfile: {
        create: {
          storeName: d.storeName,
          phone,
          addressLine1: d.addressLine1,
          city: d.city,
          region: d.region,
          market: d.market,
          nationalId: d.nationalId,
          businessRegNo: d.businessRegNo,
          taxRegNo: d.taxRegNo,
          logoUrl: d.logoUrl,
          bannerUrl: d.bannerUrl,
          kycStatus: d.kycStatus ?? KycStatus.APPROVED,
          restriction: VendorRestriction.NONE,
          commissionOverrideBps: d.commissionOverrideBps,
        },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: authz.session.user.id,
      action: "ADMIN_CREATE_VENDOR",
      entity: "VendorProfile",
      meta: { email: d.email, market: d.market },
    },
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const staff = await requirePermission();
  if (!staff.ok) return staff.response;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { id, ...data } = parsed.data;

  const fields = Object.keys(data) as (keyof typeof data)[];
  if (!fields.length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const authz = await requirePermission(...new Set(fields.map((f) => fieldPermissions[f])));
  if (!authz.ok) return authz.response;

  const vendor = await prisma.vendorProfile.findUnique({ where: { id } });
  if (!vendor) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.vendorProfile.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      userId: authz.session.user.id,
      action: "VENDOR_ADMIN_UPDATE",
      entity: "VendorProfile",
      entityId: id,
      meta: JSON.parse(JSON.stringify(data)),
    },
  });

  return NextResponse.json({ ok: true });
}
