import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { LedgerAccountType } from "@/generated/prisma/enums";
import { MARKETS } from "@/lib/markets";
import { includedTaxCents, toCents } from "@/lib/money";

type Db = Prisma.TransactionClient | typeof prisma;

async function ensureLedgerAccounts(tx: Db, vendorProfileId: string) {
  let wallet = await tx.ledgerAccount.findFirst({
    where: { type: LedgerAccountType.VENDOR_WALLET, vendorId: vendorProfileId },
  });
  if (!wallet) {
    wallet = await tx.ledgerAccount.create({
      data: {
        type: LedgerAccountType.VENDOR_WALLET,
        vendorId: vendorProfileId,
        label: `wallet:${vendorProfileId}`,
      },
    });
  }
  let platform = await tx.ledgerAccount.findFirst({
    where: { type: LedgerAccountType.PLATFORM },
  });
  if (!platform) {
    platform = await tx.ledgerAccount.create({
      data: { type: LedgerAccountType.PLATFORM, label: "platform" },
    });
  }
  let fees = await tx.ledgerAccount.findFirst({
    where: { type: LedgerAccountType.FEES },
  });
  if (!fees) {
    fees = await tx.ledgerAccount.create({
      data: { type: LedgerAccountType.FEES, label: "fees" },
    });
  }
  return { wallet, platform, fees };
}

/**
 * Record traceable ledger lines for one order line: platform → vendor wallet (net),
 * platform → fees (commission), platform → vendor wallet (sales tax / VAT).
 * Commission is charged on the pre-tax subtotal only; the vendor is the registered
 * seller in both markets, so it receives the tax to remit.
 */
export async function recordSaleMovements(
  tx: Prisma.TransactionClient,
  opts: {
    orderId: string;
    vendorProfileId: string;
    currency: string;
    subtotalCents: number;
    taxCents: number;
    commissionBps: number;
  },
) {
  const { wallet, platform, fees } = await ensureLedgerAccounts(
    tx,
    opts.vendorProfileId,
  );
  const feeCents = Math.floor((opts.subtotalCents * opts.commissionBps) / 10000);
  const netCents = opts.subtotalCents - feeCents;
  const lines = [
    {
      toAccountId: wallet.id,
      amountCents: netCents,
      kind: "SALE_NET_TO_VENDOR",
      description: "Vendor net after platform commission",
    },
    {
      toAccountId: fees.id,
      amountCents: feeCents,
      kind: "PLATFORM_COMMISSION",
      description: "Platform commission",
    },
    {
      toAccountId: wallet.id,
      amountCents: opts.taxCents,
      kind: "SALES_TAX_TO_VENDOR",
      description: "Sales tax collected for the vendor to remit",
    },
  ];
  for (const line of lines) {
    if (line.amountCents <= 0) continue;
    await tx.ledgerMovement.create({
      data: {
        ...line,
        fromAccountId: platform.id,
        orderId: opts.orderId,
        currency: opts.currency,
      },
    });
  }
}

/**
 * Books the ledger for every line of an order, using the prices and rates captured on it.
 * Unit prices are tax-inclusive; the included tax is split out before commission.
 */
export async function recordOrderLedger(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });
  for (const item of order.items) {
    const grossCents = toCents(item.unitPrice) * item.quantity;
    const taxCents = includedTaxCents(grossCents, item.taxBps, order.market);
    await recordSaleMovements(tx, {
      orderId,
      vendorProfileId: item.vendorId,
      currency: MARKETS[order.market].currency,
      subtotalCents: grossCents - taxCents,
      taxCents,
      commissionBps: item.commissionBpsApplied,
    });
  }
}
