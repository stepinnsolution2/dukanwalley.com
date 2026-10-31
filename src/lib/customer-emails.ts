// Emails to shoppers: order confirmations and updates, and cart reminders. Each one ends with
// product suggestions: what is still in their cart, then what they viewed most, then items
// similar to what they ordered, then popular products.
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import type { EmailContent, EmailLine, EmailProduct, EmailSection } from "@/lib/email-layout";
import { storefrontProductWhere } from "@/lib/catalog";
import type { CartOwner } from "@/lib/cart-session";
import { formatMoney, PAYMENT_METHOD_LABELS, type MarketCode, type MarketPaymentMethod } from "@/lib/markets";
import { restoreCartUrl, unsubscribeLinks } from "@/lib/marketing";
import { isStoredMediaUrl } from "@/lib/media-url";
import { getRecommendations, type RecommendationReason } from "@/lib/recommendations";
import { SITE_URL } from "@/lib/seo";

/** Suggestions per email (two rows of two). */
const PICKS = 4;
/** Cart items shown in a reminder. */
const CART_ITEMS = 4;

const PICK_NOTES: Record<RecommendationReason, string> = {
  bought_together: "Often bought together",
  viewed: "You viewed this",
  favourite: "In your favourites",
  similar: "Similar style",
  browsing: "Based on your browsing",
  hot: "Trending now",
  popular: "Popular",
};

/**
 * Absolute image URL that mail apps can show. Our uploads are WebP, which Outlook can't
 * display, so they go through /api/email-image (a small JPEG).
 */
export function emailImageUrl(url: string | null | undefined, banner = false) {
  if (!url) return null;
  if (isStoredMediaUrl(url)) return `${SITE_URL}/api/email-image/${url.slice("/api/media/".length)}${banner ? "?banner=1" : ""}`;
  return /^https:\/\//.test(url) ? url : null;
}

const productUrl = (slug: string) => `${SITE_URL}/products/${slug}`;

function priceText(market: MarketCode, price: number, compareAt: { toString(): string } | null) {
  const was = compareAt == null ? 0 : Number(compareAt);
  return { price: formatMoney(market, price), wasPrice: was > price ? formatMoney(market, was) : null };
}

/** The shopper behind an email address: their account, else the guest cart they used. */
export async function ownerFor(opts: { userId?: string | null; email?: string | null; cartId?: string | null }): Promise<CartOwner | null> {
  if (opts.userId) return { userId: opts.userId };
  if (opts.cartId) {
    const cart = await prisma.cart.findUnique({ where: { id: opts.cartId }, select: { userId: true, sessionId: true } });
    if (cart?.userId) return { userId: cart.userId };
    if (cart?.sessionId) return { sessionId: cart.sessionId };
  }
  if (opts.email) {
    const user = await prisma.user.findUnique({ where: { email: opts.email.toLowerCase() }, select: { id: true } });
    if (user) return { userId: user.id };
    // A guest who gave this email (sign-up box or checkout) while browsing.
    const cart = await prisma.cart.findFirst({
      where: { guestEmail: opts.email.toLowerCase(), sessionId: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { sessionId: true },
    });
    if (cart?.sessionId) return { sessionId: cart.sessionId };
  }
  return null;
}

/** "Still in your cart" and "Picked for you" sections for this shopper. */
export async function shopperSections(opts: {
  owner: CartOwner | null;
  market: MarketCode;
  /** Products not to suggest (e.g. the ones in this order). */
  exclude?: string[];
  /** Products to suggest similar items to (e.g. the ones in this order). */
  seed?: { productId: string; variantId?: string | null }[];
  /** Show the cart section (off for the cart reminder itself, which lists the cart above). */
  includeCart?: boolean;
}): Promise<EmailSection[]> {
  const exclude = new Set(opts.exclude ?? []);
  const sections: EmailSection[] = [];

  const cartItems =
    opts.owner && opts.includeCart !== false
      ? await prisma.cartItem.findMany({
          where: { cart: opts.owner, product: storefrontProductWhere(opts.market) },
          select: {
            productId: true,
            variant: { select: { price: true } },
            product: {
              select: { slug: true, name: true, basePrice: true, compareAtPrice: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
            },
          },
        })
      : [];
  const cartProducts: EmailProduct[] = [];
  for (const i of cartItems) {
    if (exclude.has(i.productId) || cartProducts.length >= CART_ITEMS) continue;
    exclude.add(i.productId);
    const price = Number(i.variant?.price ?? i.product.basePrice);
    cartProducts.push({
      name: i.product.name,
      url: productUrl(i.product.slug),
      imageUrl: emailImageUrl(i.product.images[0]?.url),
      ...priceText(opts.market, price, i.product.compareAtPrice),
    });
  }
  if (cartProducts.length) {
    sections.push({
      title: "Still in your cart",
      subtitle: "You left these behind. Complete your order before they sell out.",
      products: cartProducts,
      button: { label: "Go to my cart", url: `${SITE_URL}/cart` },
    });
  }

  const recs = (await getRecommendations({ owner: opts.owner, market: opts.market, limit: PICKS + exclude.size, seed: opts.seed, maxPerVendor: PICKS }))
    .filter((r) => !exclude.has(r.id))
    .slice(0, PICKS);
  if (recs.length) {
    const compare = new Map(
      (await prisma.product.findMany({ where: { id: { in: recs.map((r) => r.id) } }, select: { id: true, compareAtPrice: true } })).map((p) => [
        p.id,
        p.compareAtPrice,
      ]),
    );
    const personal = recs.some((r) => r.reason === "viewed" || r.reason === "favourite" || r.reason === "browsing");
    const similar = recs.some((r) => r.reason === "similar" || r.reason === "bought_together");
    sections.push({
      title: personal ? "Picked for you" : similar ? "You may also like" : "Popular on DukanWalley",
      subtitle: personal
        ? "Based on what you looked at on DukanWalley."
        : similar
          ? "Similar to what you chose, from our sellers."
          : "What other shoppers are buying right now.",
      products: recs.map((r) => {
        const { price, wasPrice } = priceText(opts.market, r.price, compare.get(r.id) ?? null);
        return {
          name: r.name,
          url: productUrl(r.slug),
          imageUrl: emailImageUrl(r.imageUrl),
          price: r.priceVaries ? `From ${price}` : price,
          wasPrice: r.priceVaries ? null : wasPrice,
          note: PICK_NOTES[r.reason],
        };
      }),
      button: { label: "Explore more products", url: `${SITE_URL}/products` },
    });
  }
  return sections;
}

type Address = { name?: string; line1?: string; line2?: string; city?: string; region?: string; postalCode?: string };

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: { product: { select: { slug: true, images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } } } },
      },
    },
  });
}
type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

function firstName(order: LoadedOrder) {
  const name = (order.shippingAddress as Address | null)?.name?.trim();
  return name ? name.split(/\s+/)[0] : null;
}

/** Order lines, totals, delivery address and payment, shared by all order emails. */
function orderSummary(order: LoadedOrder): Pick<EmailContent, "lines" | "totals" | "details"> {
  const money = (n: number | { toString(): string }) => formatMoney(order.market, n);
  const lines: EmailLine[] = order.items.map((i) => ({
    // The title ends with " (Size: L · Color: Black)"; the options go on their own line.
    title: i.variantLabel && i.title.endsWith(` (${i.variantLabel})`) ? i.title.slice(0, -i.variantLabel.length - 3) : i.title,
    detail: [i.variantLabel, `Qty ${i.quantity}`].filter(Boolean).join(" · "),
    amount: money(Number(i.unitPrice) * i.quantity),
    imageUrl: emailImageUrl(i.product.images[0]?.url),
    url: productUrl(i.product.slug),
  }));
  const totals: [string, string][] = [["Subtotal", money(order.subtotal)]];
  totals.push(["Delivery", Number(order.shipping) > 0 ? money(order.shipping) : "Free"]);
  if (Number(order.pointsDiscount) > 0) totals.push(["Reward points", `−${money(order.pointsDiscount)}`]);
  totals.push(["Total", money(order.total)]);

  const a = (order.shippingAddress ?? {}) as Address;
  const address = [a.name, a.line1, a.line2, [a.city, a.region, a.postalCode].filter(Boolean).join(", ")].filter(Boolean).join("\n");
  const details: [string, string][] = [];
  if (address) details.push(["Deliver to", address]);
  if (order.customerPhone) details.push(["Phone", order.customerPhone]);
  details.push(["Payment", PAYMENT_METHOD_LABELS[order.paymentMethod as MarketPaymentMethod] ?? order.paymentMethod]);
  return { lines, totals, details };
}

const trackUrl = (orderNumber: string) => `${SITE_URL}/orders/track?order=${encodeURIComponent(orderNumber)}`;

export type BuyerOrderEmail =
  | { kind: "confirm"; link: string; hours: number }
  | { kind: "placed" }
  | { kind: "shipped"; courier: string | null; trackingNumber: string | null }
  | { kind: "delivered" }
  | { kind: "returned" }
  | { kind: "cancelled"; reason?: string };

/** Builds one designed email to the buyer about their order (not sent). */
export async function buildBuyerOrderEmail(orderId: string, e: BuyerOrderEmail): Promise<OutgoingEmail | null> {
  const order = await loadOrder(orderId);
  if (!order) return null;
  const hi = firstName(order) ? `Hi ${firstName(order)},` : "Hi,";
  const n = order.orderNumber;
  const total = formatMoney(order.market, order.total);

  let subject: string;
  let c: Omit<EmailContent, "sections" | "lines" | "totals" | "details">;
  switch (e.kind) {
    case "confirm":
      subject = `Please confirm your order ${n}`;
      c = {
        preheader: `One tap to confirm your cash on delivery order (${total}).`,
        heading: "Please confirm your order",
        paragraphs: [hi, `Thank you for shopping with DukanWalley! Please confirm your cash on delivery order ${n} so our sellers can pack it.`],
        button: { label: "Confirm my order", url: e.link },
        afterButton: [`Orders that aren't confirmed within ${e.hours} hours are cancelled automatically.`],
        campaign: "order-confirm",
      };
      break;
    case "placed":
      subject = `Order ${n} confirmed: thank you!`;
      c = {
        preheader: `We've received your order ${n} (${total}).`,
        heading: "Thank you for your order!",
        paragraphs: [
          hi,
          `Your order ${n} is confirmed. Our sellers are getting it ready, and we'll email you again when it's on its way.`,
        ],
        button: { label: "Track my order", url: trackUrl(n) },
        campaign: "order-placed",
      };
      break;
    case "shipped":
      subject = `Order ${n} is on its way`;
      c = {
        preheader: `Your order ${n} has been shipped.`,
        heading: "Your order is on its way!",
        paragraphs: [
          hi,
          `Good news: order ${n} has been shipped${e.courier ? ` with ${e.courier}` : ""}${e.trackingNumber ? ` (tracking number ${e.trackingNumber})` : ""}.`,
          order.paymentMethod === "CASH_ON_DELIVERY" ? `Please keep ${total} ready to pay the courier on delivery.` : "",
        ].filter(Boolean),
        button: { label: "Track my order", url: trackUrl(n) },
        campaign: "order-shipped",
      };
      break;
    case "delivered":
      subject = `Order ${n} delivered`;
      c = {
        preheader: "We hope you love it!",
        heading: "Your order has been delivered",
        paragraphs: [hi, `Order ${n} has been delivered. We hope you love it! Thank you for shopping with DukanWalley.`],
        button: { label: "Shop again", url: `${SITE_URL}/products` },
        campaign: "order-delivered",
      };
      break;
    case "returned":
      subject = `Order ${n} returned`;
      c = {
        heading: "Your return is recorded",
        paragraphs: [hi, `Order ${n} has been marked as returned. If you have any questions, just contact us.`],
        button: { label: "Contact us", url: `${SITE_URL}/contact` },
        campaign: "order-returned",
      };
      break;
    case "cancelled":
      subject = `Order ${n} cancelled`;
      c = {
        heading: "Your order was cancelled",
        paragraphs: [
          hi,
          `Your order ${n} was cancelled${e.reason ? `: ${e.reason}` : ""}.`,
          "Changed your mind? The products are still waiting for you on DukanWalley.",
        ],
        button: { label: "Continue shopping", url: `${SITE_URL}/products` },
        campaign: "order-cancelled",
      };
      break;
  }

  const owner = await ownerFor({ userId: order.customerId, email: order.customerEmail, cartId: order.checkoutCartId });
  const sections = await shopperSections({
    owner,
    market: order.market,
    exclude: order.items.map((i) => i.productId),
    seed: order.items.map((i) => ({ productId: i.productId, variantId: i.variantId })),
  }).catch((err) => {
    console.error("[email] suggestions failed", n, err);
    return [];
  });

  return {
    to: order.customerEmail,
    subject,
    content: {
      ...c,
      ...orderSummary(order),
      sections,
      reason: `You're receiving this email because you placed order ${n} on dukanwalley.com.`,
    },
  };
}

/** Wording for each email in the cart reminder series (see CART_REMINDER_STEPS). */
const CART_STEP_COPY = [
  {
    subject: "Did you forget something?",
    heading: "You left something in your cart",
    intro: "We saved your cart for you. Complete your order in a minute: delivery is free and you can pay cash on delivery.",
    after: "Questions about size or delivery? Just contact us, we're happy to help.",
  },
  {
    subject: "Your picks are still waiting",
    heading: "Still thinking it over?",
    intro: "The items you liked are still in your cart. Here they are again, plus a few more we think you'll love.",
    after: "Prices and stock can change, so don't wait too long.",
  },
  {
    subject: "Don't miss out on your favourites",
    heading: "Your favourites are waiting",
    intro: "Popular items can sell out. Complete your order now so you don't miss the ones you picked.",
    after: "Free delivery on every order · Cash on Delivery available.",
  },
  {
    subject: "Last reminder about your cart",
    heading: "One last reminder",
    intro: "This is the last time we'll remind you about your cart. If you still want these items, they're one tap away.",
    after: "We won't email you about this cart again.",
  },
] as const;

/** One email of the cart reminder series (step 0–3). */
export async function buildCartReminderEmail(cartId: string, email: string, step = 0): Promise<OutgoingEmail | null> {
  const copy = CART_STEP_COPY[Math.min(step, CART_STEP_COPY.length - 1)];
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    select: {
      userId: true,
      sessionId: true,
      items: {
        select: {
          productId: true,
          variantId: true,
          quantity: true,
          variant: { select: { price: true } },
          product: {
            select: {
              slug: true,
              name: true,
              basePrice: true,
              compareAtPrice: true,
              vendor: { select: { market: true } },
              images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
            },
          },
        },
      },
    },
  });
  if (!cart?.items.length) return null;
  const market = cart.items[0].product.vendor.market;
  const owner: CartOwner | null = cart.userId ? { userId: cart.userId } : cart.sessionId ? { sessionId: cart.sessionId } : null;
  const money = (n: number) => formatMoney(market, n);
  const lines: EmailLine[] = cart.items.map((i) => ({
    title: i.product.name,
    detail: `Qty ${i.quantity}`,
    amount: money(Number(i.variant?.price ?? i.product.basePrice) * i.quantity),
    imageUrl: emailImageUrl(i.product.images[0]?.url),
    url: productUrl(i.product.slug),
  }));
  const subtotal = cart.items.reduce((s, i) => s + Number(i.variant?.price ?? i.product.basePrice) * i.quantity, 0);
  const sections = await shopperSections({
    owner,
    market,
    includeCart: false,
    exclude: cart.items.map((i) => i.productId),
    seed: cart.items.map((i) => ({ productId: i.productId, variantId: i.variantId })),
  }).catch(() => []);

  const restore = restoreCartUrl(cartId);
  const { page, oneClick } = unsubscribeLinks(email);
  return {
    to: email,
    subject: copy.subject,
    listUnsubscribe: oneClick,
    content: {
      preheader: `${cart.items[0].product.name}${cart.items.length > 1 ? ` and ${cart.items.length - 1} more` : ""} ${cart.items.length > 1 ? "are" : "is"} waiting for you.`,
      heading: copy.heading,
      paragraphs: ["Hi,", copy.intro],
      lines: lines.map((l) => ({ ...l, url: restore })),
      totals: [["Subtotal", money(subtotal)]],
      button: { label: "Complete my order", url: restore },
      afterButton: [copy.after],
      sections,
      campaign: `abandoned-cart-${step + 1}`,
      reason: "You're receiving this email because you added items to your cart on dukanwalley.com.",
      unsubscribeUrl: page,
    },
  };
}

export type OutgoingEmail = { to: string; subject: string; content: EmailContent; listUnsubscribe?: string };

/** One designed email to the buyer about their order. Throws on send failure. */
export async function sendBuyerOrderEmail(orderId: string, e: BuyerOrderEmail) {
  const email = await buildBuyerOrderEmail(orderId, e);
  if (email) await sendEmail(email);
}

/** Cart reminder email (step 0–3). Throws on send failure. Returns false if the cart is empty. */
export async function sendCartReminderEmail(cartId: string, to: string, step = 0) {
  const email = await buildCartReminderEmail(cartId, to, step);
  if (email) await sendEmail(email);
  return !!email;
}
