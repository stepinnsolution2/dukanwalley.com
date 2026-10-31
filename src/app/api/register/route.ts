import { captureEmail } from "@/lib/marketing";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { MARKETS, normalizeMobile } from "@/lib/markets";
import { KycStatus, Market, UserRole, VendorRestriction } from "@/generated/prisma/enums";
import { uniqueVendorSlug } from "@/lib/vendor-slug";

const customerSchema = z.object({
  kind: z.literal("customer"),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().optional(),
});

const vendorSchema = z.object({
  kind: z.literal("vendor"),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().min(5),
  storeName: z.string().min(2),
  addressLine1: z.string().min(3),
  addressLine2: z.string().optional(),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().optional(),
  market: z.nativeEnum(Market),
  nationalId: z.string().min(5),
  businessRegNo: z.string().optional(),
  taxRegNo: z.string().optional(),
  logoUrl: z.string().url().optional().or(z.literal("")),
  bannerUrl: z.string().url().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = z
    .discriminatedUnion("kind", [customerSchema, vendorSchema])
    .safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const exists = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (exists) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }
  const passwordHash = await hashPassword(data.password);

  if (data.kind === "customer") {
    await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        phone: data.phone,
        role: UserRole.CUSTOMER,
      },
    });
    // Listed in Admin › Newsletter › Contacts; newsletters only if they sign up for them.
    await captureEmail({ email: data.email, source: "account", newsletter: false, phone: data.phone }).catch(() => null);
    return NextResponse.json({ ok: true });
  }

  const m = MARKETS[data.market];
  const phone = normalizeMobile(data.market, data.phone);
  if (!phone) {
    return NextResponse.json(
      { error: `Enter a ${m.name} mobile number, e.g. ${m.mobileExample}` },
      { status: 400 },
    );
  }
  if (!m.regions.includes(data.region)) {
    return NextResponse.json(
      { error: `Choose a valid ${m.regionLabel.toLowerCase()} in ${m.name}` },
      { status: 400 },
    );
  }

  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      phone,
      role: UserRole.VENDOR,
      vendorProfile: {
        create: {
          storeName: data.storeName,
          slug: await uniqueVendorSlug(data.storeName),
          phone,
          addressLine1: data.addressLine1,
          addressLine2: data.addressLine2,
          city: data.city,
          region: data.region,
          postalCode: data.postalCode,
          market: data.market,
          nationalId: data.nationalId,
          businessRegNo: data.businessRegNo || null,
          taxRegNo: data.taxRegNo || null,
          logoUrl: data.logoUrl || null,
          bannerUrl: data.bannerUrl || null,
          kycStatus: KycStatus.PENDING,
          restriction: VendorRestriction.NONE,
        },
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "VENDOR_SELF_REGISTER",
      entity: "VendorProfile",
      entityId: user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
