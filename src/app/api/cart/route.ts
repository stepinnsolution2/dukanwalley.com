import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { attributeNameLookup, sellableVendorWhere } from "@/lib/catalog";
import { getOrCreateCartOwner } from "@/lib/cart-session";
import { getCurrentMarket } from "@/lib/market-session";
import { MARKETS } from "@/lib/markets";
import { availablePaymentMethods } from "@/lib/payments";
import { toCents } from "@/lib/money";
import { pointsForAmount } from "@/lib/reward-rules";
import { getEarnBps, getPointsBalance } from "@/lib/rewards";
import { variantLabel, type VariantOptions } from "@/lib/variants";
import { publicVendor } from "@/lib/vendor-slug";

const MAX_QTY = 99;

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          images: true,
          // Public response: never expose KYC notes, commission or contact details.
          vendor: { select: { id: true, storeName: true, displayName: true, market: true } },
        },
      },
      variant: true,
    },
    orderBy: { id: "asc" },
  },
} as const;

const addSchema = z.object({
  productId: z.string().min(1),
  /** Required when the product has variants (size, colour…). */
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().min(1).max(MAX_QTY).default(1),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().min(5).optional(),
});

const patchSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(0).max(MAX_QTY),
});

async function getOrCreateCart() {
  const owner = await getOrCreateCartOwner();
  return prisma.cart.upsert({
    where: owner,
    create: owner,
    update: {},
    include: cartInclude,
  });
}

function loadCart(id: string) {
  return prisma.cart.findUniqueOrThrow({ where: { id }, include: cartInclude });
}

type LoadedCart = Awaited<ReturnType<typeof loadCart>>;

/**
 * A cart belongs to the market of its items (all items share one). An empty cart
 * follows the storefront the shopper is browsing.
 */
async function cartResponse(cart: LoadedCart) {
  const market = cart.items[0]?.product.vendor.market ?? (await getCurrentMarket());
  // Each line's price is its variant's price when set, else the product's.
  const namesFor = await attributeNameLookup();
  const items = cart.items.map((i) => ({
    ...i,
    product: { ...i.product, vendor: publicVendor(i.product.vendor) },
    unitPrice: Number(i.variant?.price ?? i.product.basePrice),
    variantLabel: i.variant
      ? variantLabel(
          i.variant.options as VariantOptions,
          namesFor(i.product.categoryId),
        )
      : null,
  }));
  const totalMinor = items.reduce((s, i) => s + toCents(i.unitPrice) * i.quantity, 0);
  const rewards = {
    signedIn: !!cart.userId,
    /** Points this cart would earn once delivered (shown to guests as a sign-in nudge). */
    earnPoints: pointsForAmount(market, totalMinor, await getEarnBps()),
    balance: cart.userId ? await getPointsBalance(cart.userId, market) : 0,
  };
  return NextResponse.json({
    cart: { ...cart, items },
    market,
    paymentMethods: await availablePaymentMethods(market),
    rewards,
  });
}

function stockError(name: string, stock: number, showCount = true) {
  return NextResponse.json(
    {
      error:
        stock <= 0 ? `${name} is out of stock` : showCount ? `Only ${stock} of ${name} left` : `Not enough ${name} in stock`,
    },
    { status: 400 },
  );
}

export async function GET() {
  return cartResponse(await getOrCreateCart());
}

export async function POST(req: Request) {
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { productId, variantId, quantity, guestEmail, guestPhone } = parsed.data;

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      approvalStatus: "APPROVED",
      displayOnStorefront: true,
      availableForSale: true,
      vendor: sellableVendorWhere,
    },
    include: { vendor: { select: { market: true } }, variants: true },
  });
  if (!product) {
    return NextResponse.json({ error: "Product not available" }, { status: 400 });
  }
  const variant = variantId ? product.variants.find((v) => v.id === variantId) : undefined;
  if (product.variants.length && !variant) {
    return NextResponse.json({ error: "Please choose your options (e.g. size and colour)" }, { status: 400 });
  }
  if (!product.variants.length && variantId) {
    return NextResponse.json({ error: "This product has no options" }, { status: 400 });
  }
  const variantKey = variant?.id ?? "";
  const available = variant ? variant.stock : product.stock;

  const cart = await getOrCreateCart();
  const otherMarket = cart.items.find((i) => i.product.vendor.market !== product.vendor.market);
  if (otherMarket) {
    const name = MARKETS[otherMarket.product.vendor.market].name;
    return NextResponse.json(
      { error: `Your cart has items from the ${name} store. Check out or remove them first.` },
      { status: 409 },
    );
  }
  const existing = cart.items.find((i) => i.productId === productId && i.variantKey === variantKey);
  const newQty = (existing?.quantity ?? 0) + quantity;
  if (newQty > available) return stockError(product.name, available, product.showStockCount);
  if (newQty > MAX_QTY) {
    return NextResponse.json({ error: `Maximum ${MAX_QTY} per item` }, { status: 400 });
  }

  await prisma.cartItem.upsert({
    where: { cartId_productId_variantKey: { cartId: cart.id, productId, variantKey } },
    create: { cartId: cart.id, productId, variantId: variant?.id, variantKey, quantity: newQty },
    update: { quantity: newQty },
  });

  if (guestEmail || guestPhone) {
    await prisma.cart.update({
      where: { id: cart.id },
      data: { guestEmail, guestPhone },
    });
  }

  return cartResponse(await loadCart(cart.id));
}

export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { itemId, quantity } = parsed.data;

  const cart = await getOrCreateCart();
  const item = cart.items.find((i) => i.id === itemId);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (quantity === 0) {
    await prisma.cartItem.delete({ where: { id: itemId } });
  } else {
    // Reducing is always allowed, so shoppers can get back under the available stock.
    const available = item.variant ? item.variant.stock : item.product.stock;
    if (quantity > item.quantity && quantity > available) {
      return stockError(item.product.name, available, item.product.showStockCount);
    }
    await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
  }
  return cartResponse(await loadCart(cart.id));
}
