import { freeGiftMinOrder } from "@/lib/marketing";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { attributeNameLookup, sellableVendorWhere } from "@/lib/catalog";
import { logOrderEvent } from "@/lib/order-lifecycle";
import { getCartOwner } from "@/lib/cart-session";
import { resolveCommissionBps } from "@/lib/commission";
import { deliveryRegions, MARKETS, normalizeMobile, type MarketPaymentMethod } from "@/lib/markets";
import { fromCents, includedTaxCents, toCents } from "@/lib/money";
import { cancelUnpaidOrder, requestCodConfirmation } from "@/lib/orders";
import { appBaseUrl } from "@/lib/payments/common";
import { availablePaymentMethods, startPayment } from "@/lib/payments";
import { broadcastAdmin } from "@/lib/realtime";
import { maxRedeemablePoints, pointsValueMinor } from "@/lib/reward-rules";
import { getPointsBalance, redeemPoints } from "@/lib/rewards";
import { variantLabel, type VariantOptions } from "@/lib/variants";
import { PaymentMethod, OrderStatus } from "@/generated/prisma/enums";

// Country comes from the cart's market, not from the client.
const addressSchema = z.object({
  name: z.string().min(1),
  line1: z.string().min(3),
  line2: z.string().optional(),
  city: z.string().min(1),
  region: z.string().min(1),
  postalCode: z.string().optional(),
});

const orderSchema = z.object({
  // PayPal and Tabby stay in the schema enum but are not accepted until integrated.
  paymentMethod: z.enum([
    PaymentMethod.CASH_ON_DELIVERY,
    PaymentMethod.STRIPE,
    PaymentMethod.JAZZCASH,
    PaymentMethod.EASYPAISA,
    PaymentMethod.CARD,
  ]),
  customerEmail: z.string().email(),
  // Required: cash on delivery, wallets and couriers depend on reaching the buyer.
  customerPhone: z.string().min(5),
  shippingAddress: addressSchema,
  /** Signed-in customers: spend as many reward points as allowed on this order. */
  usePoints: z.boolean().optional(),
});

/** Thrown inside the order transaction to roll it back with a client-facing message. */
class CheckoutError extends Error {}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

export async function POST(req: Request) {
  const session = await auth();
  const parsed = orderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { paymentMethod, customerEmail, shippingAddress } = parsed.data;

  const owner = await getCartOwner();
  const cart = owner
    ? await prisma.cart.findUnique({
        where: owner,
        include: {
          items: {
            include: {
              product: {
                include: {
                  vendor: true,
                  variants: { select: { id: true } },
                },
              },
              variant: true,
            },
          },
        },
      })
    : null;
  if (!cart?.items.length) return badRequest("Cart is empty");

  const market = cart.items[0].product.vendor.market;
  if (cart.items.some((i) => i.product.vendor.market !== market)) {
    return badRequest("Cart mixes stores from different countries");
  }
  const m = MARKETS[market];
  const namesFor = await attributeNameLookup();
  const areas = deliveryRegions(m);
  if (!areas.includes(shippingAddress.region)) {
    return badRequest(`We currently deliver to ${areas.join(", ")}`);
  }
  const customerPhone = normalizeMobile(market, parsed.data.customerPhone);
  if (!customerPhone) {
    return badRequest(`Enter a ${m.name} mobile number, e.g. ${m.mobileExample}`);
  }
  const method = paymentMethod as MarketPaymentMethod;
  if (!(await availablePaymentMethods(market)).includes(method)) {
    return badRequest(`That payment method isn't available in ${m.name}`);
  }
  const isCod = method === "CASH_ON_DELIVERY";

  const orderNumber = `ORD-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;

  // Prices are tax-inclusive: the order total is the sum of shelf prices, and the tax
  // inside each line is split out for the subtotal / tax breakdown and the ledger.
  let grossCents = 0;
  let taxTotalCents = 0;
  const lines: {
    productId: string;
    vendorId: string;
    title: string;
    variantId: string | null;
    variantLabel: string | null;
    unitCents: number;
    quantity: number;
    taxBps: number;
    commissionBps: number;
    unlimited: boolean;
  }[] = [];
  for (const item of cart.items) {
    const p = item.product;
    const vendorCanSell =
      p.vendor.kycStatus === "APPROVED" &&
      (sellableVendorWhere.restriction.in as readonly string[]).includes(p.vendor.restriction);
    if (
      p.approvalStatus !== "APPROVED" ||
      !p.displayOnStorefront ||
      !p.availableForSale ||
      !vendorCanSell
    ) {
      return NextResponse.json(
        { error: `Product no longer available: ${p.name}` },
        { status: 400 },
      );
    }
    // Options were added to the product after it went in the cart: the shopper must pick them.
    if (p.variants.length && !item.variant) {
      return badRequest(`Please choose options for ${p.name} again (remove it from your cart and re-add it)`);
    }
    const label = item.variant
      ? variantLabel(
          item.variant.options as VariantOptions,
          namesFor(p.categoryId),
        )
      : null;
    // Tax is optional per vendor: only vendors registered for sales tax/VAT charge it.
    const taxBps = p.vendor.taxRegNo ? p.salesTaxBps : 0;
    const unitCents = toCents(item.variant?.price ?? p.basePrice);
    const lineGrossCents = unitCents * item.quantity;
    grossCents += lineGrossCents;
    taxTotalCents += includedTaxCents(lineGrossCents, taxBps, market);
    lines.push({
      productId: p.id,
      vendorId: p.vendorId,
      unlimited: p.unlimitedStock,
      title: label ? `${p.name} (${label})` : p.name,
      variantId: item.variant?.id ?? null,
      variantLabel: label,
      unitCents,
      quantity: item.quantity,
      taxBps,
      commissionBps: await resolveCommissionBps({
        categoryId: p.categoryId,
        vendorProfileId: p.vendorId,
      }),
    });
  }

  const shippingCents = 0;
  // Points are a platform-funded discount: vendors are still paid on shelf prices.
  const userId = session?.user?.id;
  const pointsRedeemed =
    userId && parsed.data.usePoints
      ? maxRedeemablePoints(market, grossCents + shippingCents, await getPointsBalance(userId, market))
      : 0;
  const pointsDiscountCents = pointsValueMinor(market, pointsRedeemed);
  const totalCents = grossCents + shippingCents - pointsDiscountCents;
  // Admin › Settings › Email marketing: items worth this much earn a free gift in the parcel.
  const giftMin = await freeGiftMinOrder(market);
  const freeGift = giftMin !== null && grossCents >= giftMin * 100;

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          orderNumber,
          market,
          customerId: session?.user?.id,
          customerEmail,
          customerPhone,
          paymentMethod,
          // COD waits for the buyer's confirmation; online orders wait for the gateway.
          status: isCod ? OrderStatus.PLACED : OrderStatus.PENDING_PAYMENT,
          checkoutCartId: cart.id,
          subtotal: fromCents(grossCents - taxTotalCents),
          taxTotal: fromCents(taxTotalCents),
          shipping: fromCents(shippingCents),
          pointsRedeemed,
          pointsDiscount: fromCents(pointsDiscountCents),
          freeGift,
          total: fromCents(totalCents),
          shippingAddress: { ...shippingAddress, country: market },
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              vendorId: l.vendorId,
              title: l.title,
              unitPrice: fromCents(l.unitCents),
              quantity: l.quantity,
              taxBps: l.taxBps,
              commissionBpsApplied: l.commissionBps,
              variantId: l.variantId,
              variantLabel: l.variantLabel,
            })),
          },
        },
      });

      // Conditional decrement: the row lock makes concurrent checkouts serialize here,
      // so stock can never go below zero.
      for (const line of lines) {
        // Unlimited stock: nothing to reserve (the stock stays at UNLIMITED_STOCK).
        const take = line.unlimited ? 0 : line.quantity;
        if (line.variantId) {
          const variantReserved = await tx.productVariant.updateMany({
            where: { id: line.variantId, stock: { gte: take } },
            data: { stock: { decrement: take } },
          });
          if (variantReserved.count === 0) {
            throw new CheckoutError(`Insufficient stock for ${line.title}`);
          }
        }
        const reserved = await tx.product.updateMany({
          where: {
            id: line.productId,
            stock: { gte: take },
            approvalStatus: "APPROVED",
            availableForSale: true,
            // Re-checked inside the transaction: a vendor suspended mid-checkout can't sell.
            vendor: sellableVendorWhere,
          },
          data: { stock: { decrement: take } },
        });
        if (reserved.count === 0) {
          throw new CheckoutError(`Insufficient stock for ${line.title}`);
        }
      }

      if (pointsRedeemed > 0 && !(await redeemPoints(tx, userId!, market, pointsRedeemed, o.id))) {
        throw new CheckoutError("Your points balance changed. Please review your order and try again.");
      }

      await logOrderEvent(
        tx,
        o.id,
        o.status,
        session?.user?.id ? "customer" : "guest",
        isCod ? "Awaiting buyer confirmation" : `Payment started (${method})`,
      );

      // Nothing is booked to the ledger yet: COD is booked when the buyer confirms,
      // online payments when the gateway confirms. An abandoned online payment leaves the
      // cart intact; COD clears it now.
      if (isCod) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return o;
    });
  } catch (e) {
    if (e instanceof CheckoutError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  const appUrl = appBaseUrl(req.url);

  if (isCod) {
    after(async () => {
      await requestCodConfirmation(order.id, appUrl);
      await broadcastAdmin("order:new", {
        summary: `COD order ${orderNumber} (${m.name}) awaiting buyer confirmation`,
      });
    });
    return NextResponse.json({ orderId: order.id, orderNumber });
  }

  try {
    const payment = await startPayment({
      order: {
        id: order.id,
        orderNumber,
        totalMinor: totalCents,
        customerEmail,
        customerPhone,
      },
      market,
      method,
      // With a points discount the lines no longer add up to the total: charge one line.
      lines:
        pointsDiscountCents > 0
          ? [{ title: `Order ${orderNumber} (after reward points)`, unitMinor: totalCents, quantity: 1 }]
          : lines.map((l) => ({ title: l.title, unitMinor: l.unitCents, quantity: l.quantity })),
      appUrl,
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentProvider: payment.provider, paymentIntentId: payment.paymentRef },
    });
    return NextResponse.json({
      orderId: order.id,
      orderNumber,
      ...("url" in payment.redirect
        ? { checkoutUrl: payment.redirect.url }
        : { paymentForm: payment.redirect.form }),
    });
  } catch (e) {
    console.error(`[payments] could not start ${method} for ${orderNumber}`, e);
    await cancelUnpaidOrder(order.id);
    return NextResponse.json({ error: "Could not start the payment. Please try again." }, { status: 502 });
  }
}
