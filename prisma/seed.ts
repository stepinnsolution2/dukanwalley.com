import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  KycStatus,
  Market,
  ProductApprovalStatus,
  UserRole,
  VendorRestriction,
} from "../src/generated/prisma/enums";
import { hash } from "bcryptjs";
import { seedCategories } from "./seed-categories";

async function hashPassword(plain: string) {
  return hash(plain, 12);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const password = await hashPassword("Password123!");

  const owner = await prisma.user.upsert({
    where: { email: "owner@marketplace.dev" },
    update: {},
    create: {
      email: "owner@marketplace.dev",
      passwordHash: password,
      name: "Company Owner",
      role: UserRole.SUPER_ADMIN,
      phone: "+923000000001",
    },
  });

  await prisma.user.upsert({
    where: { email: "ops@marketplace.dev" },
    update: {},
    create: {
      email: "ops@marketplace.dev",
      passwordHash: password,
      name: "Operations Subadmin",
      role: UserRole.SUBADMIN,
      phone: "+923000000002",
    },
  });

  await prisma.user.upsert({
    where: { email: "assistant@marketplace.dev" },
    update: {},
    create: {
      email: "assistant@marketplace.dev",
      passwordHash: password,
      name: "Support Assistant",
      role: UserRole.ASSISTANT,
      phone: "+923000000006",
    },
  });

  const salesUser = await prisma.user.upsert({
    where: { email: "sales@marketplace.dev" },
    update: {},
    create: {
      email: "sales@marketplace.dev",
      passwordHash: password,
      name: "Alex Sales",
      role: UserRole.SALES,
      phone: "+923000000003",
    },
  });

  await prisma.salesProfile.upsert({
    where: { userId: salesUser.id },
    update: {},
    create: {
      userId: salesUser.id,
      createdById: owner.id,
      employeeCode: "S001",
    },
  });

  const vendorUser = await prisma.user.upsert({
    where: { email: "vendor@marketplace.dev" },
    update: {},
    create: {
      email: "vendor@marketplace.dev",
      passwordHash: password,
      name: "Vendor One",
      role: UserRole.VENDOR,
      phone: "+923001234567",
    },
  });

  // Demo vendor is sales-tax registered (STRN), so its 18% product tax applies.
  const vendor = await prisma.vendorProfile.upsert({
    where: { userId: vendorUser.id },
    update: { taxRegNo: "3277876123456" },
    create: {
      userId: vendorUser.id,
      storeName: "Urban Supply Co.",
      slug: "urban-supply-co",
      phone: "+923001234567",
      addressLine1: "Plot 12, Shahrah-e-Faisal",
      city: "Karachi",
      region: "Sindh",
      postalCode: "75400",
      market: Market.PK,
      nationalId: "42101-1234567-1",
      businessRegNo: "1234567-8",
      taxRegNo: "3277876123456",
      kycStatus: KycStatus.APPROVED,
      restriction: VendorRestriction.NONE,
      logoUrl: "https://placehold.co/120x120/png?text=Logo",
      bannerUrl: "https://placehold.co/1200x320/png?text=Banner",
    },
  });

  await prisma.user.upsert({
    where: { email: "buyer@marketplace.dev" },
    update: {},
    create: {
      email: "buyer@marketplace.dev",
      passwordHash: password,
      name: "Test Buyer",
      role: UserRole.CUSTOMER,
      phone: "+923000000005",
    },
  });

  await prisma.platformSetting.upsert({
    where: { key: "GLOBAL_COMMISSION_BPS" },
    update: { value: { bps: 1200 } },
    create: { key: "GLOBAL_COMMISSION_BPS", value: { bps: 1200 } },
  });

  await prisma.platformSetting.upsert({
    where: { key: "COMPANY_PROFILE" },
    update: {
      value: {
        name: "Demo Marketplace Inc.",
        supportEmail: "support@marketplace.dev",
      },
    },
    create: {
      key: "COMPANY_PROFILE",
      value: {
        name: "Demo Marketplace Inc.",
        supportEmail: "support@marketplace.dev",
      },
    },
  });

  await prisma.commissionRule.deleteMany({ where: { ruleType: "GLOBAL" } });
  await prisma.commissionRule.create({
    data: {
      name: "Default global",
      ruleType: "GLOBAL",
      bps: 1200,
      active: true,
    },
  });

  // Category tree (Shoes › Men, Garments › Women…) and category fields.
  await seedCategories(prisma);

  const shoes = await prisma.category.findUniqueOrThrow({
    where: { slug: "shoes" },
  });

  const salesProfile = await prisma.salesProfile.findUniqueOrThrow({
    where: { userId: salesUser.id },
  });

  await prisma.product.upsert({
    where: { slug: "demo-running-shoe" },
    update: { basePrice: 8999, salesTaxBps: 1800 },
    create: {
      slug: "demo-running-shoe",
      name: "Demo Running Shoe",
      description: "Lightweight trainer uploaded by sales — pending review.",
      basePrice: 8999,
      salesTaxBps: 1800,
      stock: 40,
      categoryId: shoes.id,
      vendorId: vendor.id,
      salesPersonId: salesProfile.id,
      approvalStatus: ProductApprovalStatus.PENDING_REVIEW,
      displayOnStorefront: false,
      availableForSale: false,
      zoneTags: ["west", "priority-1"],
      metadata: { size: "42", color: "Black" },
      images: {
        create: [
          {
            url: "https://placehold.co/600x600/png?text=Shoe",
            sortOrder: 0,
          },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: "approved-tee" },
    update: { basePrice: 2499, salesTaxBps: 1800 },
    create: {
      slug: "approved-tee",
      name: "Organic Cotton Tee",
      description: "Live on storefront for demos.",
      basePrice: 2499,
      salesTaxBps: 1800,
      stock: 200,
      categoryId: (
        await prisma.category.findUniqueOrThrow({ where: { slug: "garments" } })
      ).id,
      vendorId: vendor.id,
      salesPersonId: salesProfile.id,
      approvalStatus: ProductApprovalStatus.APPROVED,
      approvedById: owner.id,
      approvedAt: new Date(),
      displayOnStorefront: true,
      availableForSale: true,
      zoneTags: ["national"],
      images: {
        create: [
          {
            url: "https://placehold.co/600x600/png?text=Tee",
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // UAE store: prices in AED with 5% VAT included.
  const uaeVendorUser = await prisma.user.upsert({
    where: { email: "vendor-uae@marketplace.dev" },
    update: {},
    create: {
      email: "vendor-uae@marketplace.dev",
      passwordHash: password,
      name: "Vendor UAE",
      role: UserRole.VENDOR,
      phone: "+971501234567",
    },
  });

  const uaeVendor = await prisma.vendorProfile.upsert({
    where: { userId: uaeVendorUser.id },
    update: {},
    create: {
      userId: uaeVendorUser.id,
      storeName: "Gulf Gadgets Trading",
      slug: "gulf-gadgets-trading",
      phone: "+971501234567",
      addressLine1: "Office 804, Al Quoz Industrial Area 3",
      city: "Dubai",
      region: "Dubai",
      market: Market.AE,
      nationalId: "784-1990-1234567-1",
      businessRegNo: "DED-1234567",
      taxRegNo: "100123456700003",
      kycStatus: KycStatus.APPROVED,
      restriction: VendorRestriction.NONE,
      logoUrl: "https://placehold.co/120x120/png?text=GG",
    },
  });

  const uaeProducts = [
    { slug: "uae-wireless-earbuds", name: "Wireless Earbuds Pro", basePrice: 249.5, category: "mobile-accessories", stock: 60 },
    { slug: "uae-laptop-sleeve", name: "Leather Laptop Sleeve 14\"", basePrice: 189, category: "laptop-accessories", stock: 25 },
  ];
  for (const p of uaeProducts) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { basePrice: p.basePrice, salesTaxBps: 500 },
      create: {
        slug: p.slug,
        name: p.name,
        description: "Live in the UAE store for demos.",
        basePrice: p.basePrice,
        salesTaxBps: 500,
        stock: p.stock,
        categoryId: (await prisma.category.findUniqueOrThrow({ where: { slug: p.category } })).id,
        vendorId: uaeVendor.id,
        salesPersonId: salesProfile.id,
        approvalStatus: ProductApprovalStatus.APPROVED,
        approvedById: owner.id,
        approvedAt: new Date(),
        displayOnStorefront: true,
        availableForSale: true,
        images: {
          create: [{ url: `https://placehold.co/600x600/png?text=${encodeURIComponent(p.name)}`, sortOrder: 0 }],
        },
      },
    });
  }

  console.log("Seed complete. Log in:");
  console.log("  owner@marketplace.dev / Password123!");
  console.log("  sales@marketplace.dev / Password123!");
  console.log("  ops@marketplace.dev / Password123! (subadmin)");
  console.log("  assistant@marketplace.dev / Password123! (assistant, view-only)");
  console.log("  vendor@marketplace.dev / Password123! (Pakistan store)");
  console.log("  vendor-uae@marketplace.dev / Password123! (UAE store)");
  console.log("  buyer@marketplace.dev / Password123!");
}

main()
  .then(() => prisma.$disconnect())
  .then(() => pool.end())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
