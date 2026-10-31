import { prisma } from "@/lib/db";

/**
 * Effective commission in basis points (10000 = 100%). Most specific wins:
 * vendor rule → vendor override → category rule → global rule → platform setting → 10%.
 */
export async function resolveCommissionBps(opts: {
  categoryId: string;
  vendorProfileId: string;
}) {
  const vendorRule = await prisma.commissionRule.findFirst({
    where: {
      active: true,
      ruleType: "VENDOR",
      vendorId: opts.vendorProfileId,
    },
    orderBy: { createdAt: "desc" },
  });
  if (vendorRule) return vendorRule.bps;

  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: opts.vendorProfileId },
    select: { commissionOverrideBps: true },
  });
  if (vendor?.commissionOverrideBps != null) return vendor.commissionOverrideBps;

  const catRule = await prisma.commissionRule.findFirst({
    where: {
      active: true,
      ruleType: "CATEGORY",
      categoryId: opts.categoryId,
    },
    orderBy: { createdAt: "desc" },
  });
  if (catRule) return catRule.bps;

  return platformDefaultCommissionBps();
}

/** The rate for stores and categories without their own: global rule → platform setting → 10%. */
export async function platformDefaultCommissionBps() {
  const global = await prisma.commissionRule.findFirst({
    where: { active: true, ruleType: "GLOBAL" },
    orderBy: { createdAt: "desc" },
  });
  if (global) return global.bps;

  const setting = await prisma.platformSetting.findUnique({
    where: { key: "GLOBAL_COMMISSION_BPS" },
  });
  const v = setting?.value as { bps?: number } | undefined;
  return v?.bps ?? 1000;
}
