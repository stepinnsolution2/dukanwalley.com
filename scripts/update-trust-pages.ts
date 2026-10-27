// One-off (2026-10-27): fills the trust page drafts with the owner's business details and publishes
// the ones that are complete. Pages the owner has already edited by hand (no "[[fill:" left) are
// left alone.
//
//   npx tsx scripts/update-trust-pages.ts
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { BUSINESS } from "../src/lib/seo";

const AREAS = "Punjab, Khyber Pakhtunkhwa (KPK), Sindh and Islamabad";
const PHONE = `[${BUSINESS.phoneDisplay}](tel:${BUSINESS.phone})`;
const WHATSAPP = `[${BUSINESS.phoneDisplay}](https://wa.me/${BUSINESS.phone.replace(/\D/g, "")})`;
const EMAIL = `[${BUSINESS.email}](mailto:${BUSINESS.email})`;
const ADDRESS = `${BUSINESS.streetAddress}, ${BUSINESS.locality}, ${BUSINESS.city}, Pakistan`;
/** Markdown hard line break. */
const BR = "\\\n";

const pages: Record<string, { body: string; publish: boolean; seoDescription?: string }> = {
  about: {
    publish: true,
    body: `${BUSINESS.name} is an online marketplace for shoppers in Pakistan. Many sellers list their products in one place, so you can compare designs and prices and order online. **Multiple sellers, endless choices.**

## What you can shop
Women's and men's fashion, kids' clothing, shoes, bags, jewellery and watches, beauty products, mobiles and accessories, computers, electronics, home and kitchen, and sports items. [Browse all products](/products).

## Our sellers
Sellers on ${BUSINESS.name} are reviewed before their products appear in the shop. Each product page shows which store sells it, and every store has its own page. [See our sellers](/sellers).

## Free delivery
We deliver to ${AREAS} in about **3 working days**, and delivery is **free**. You can pay **cash on delivery**. See our [shipping policy](/shipping-policy).

## Where we are
${BUSINESS.name} is based in Gulberg, Lahore, at ${ADDRESS}.

## Contact
Our support team is available **24/7** by phone or WhatsApp on ${PHONE}, or by email at ${EMAIL}. [All contact options](/contact).`,
  },
  contact: {
    publish: true,
    seoDescription: `Contact ${BUSINESS.name} 24/7 by phone, WhatsApp (${BUSINESS.phoneDisplay}) or email for help with orders and delivery.`,
    body: `We're happy to help with orders, delivery, returns or anything else, **24 hours a day, 7 days a week**.

## Customer support
- **Phone:** ${PHONE}
- **WhatsApp:** ${WHATSAPP}
- **Email:** ${EMAIL}
- **Hours:** 24/7

## Visit us
**${BUSINESS.legalName}**${BR}${BUSINESS.streetAddress}, ${BUSINESS.locality}${BR}Near Hafeez Center, ${BUSINESS.city}, Pakistan

## Track your order
Already ordered? [Track your order](/orders/track) with your order number.

## Sell on ${BUSINESS.name}
Have a store? [Register as a seller](/vendor/register).`,
  },
  "shipping-policy": {
    publish: true,
    seoDescription: `Free delivery in about 3 working days across ${AREAS}. Cash on delivery available.`,
    body: `## Where we deliver
We deliver to addresses in **${AREAS}**.

## Delivery time
Orders are usually delivered within **3 working days**. Orders are dispatched after they are confirmed, and delivery may take a little longer during sales, public holidays and bad weather.

## Shipping charges
Delivery is **free** on all orders. There's no shipping fee.

## Cash on delivery
You can pay in cash when your order arrives. After you place a cash-on-delivery order we send you a link to confirm it; orders that aren't confirmed within 48 hours are cancelled automatically.

## Orders from several sellers
${BUSINESS.name} is a marketplace, so items from different sellers may arrive in separate parcels and on different days.

## Tracking
You can [track your order](/orders/track) at any time with your order number.

## Questions
Our support team is available 24/7 on ${PHONE} (phone and WhatsApp) or ${EMAIL}.`,
  },
  "privacy-policy": {
    publish: true,
    body: `This policy explains what information ${BUSINESS.name} collects and how we use it. It applies from 27 October 2026.

## Information we collect
- **Account details:** your name, email address, phone number and password (stored only as a secure hash, never in plain text).
- **Order details:** delivery address, the products you order and your order history.
- **Payment details:** online payments are handled by the payment provider (for example JazzCash or Easypaisa, when available). We do not store your card or wallet details.
- **Usage information:** the products you view and add to your cart, used to show relevant suggestions.
- **Cookies:** small files that keep you signed in, remember your cart and your country (Pakistan or UAE), and measure visits with Google Analytics.

## How we use it
- To process and deliver your orders and contact you about them, including order confirmations by SMS, WhatsApp or email.
- To pass the delivery details an order needs to the seller and courier delivering it.
- To answer your questions and handle returns.
- To improve the site and show relevant products.
- To send our newsletter, only if you subscribe; you can unsubscribe at any time.

## Sharing
We do not sell your personal information. We share it only with the sellers, couriers and service providers (payment, email, SMS and hosting) needed to run your orders and this site, or when the law requires it.

## Keeping your data safe
The site uses HTTPS encryption, and passwords are stored only as secure hashes.

## Your choices
You can ask us to correct or delete your account information by contacting us. We keep order records for as long as needed to provide our service and as required by tax and accounting rules in Pakistan.

## Contact
Questions about privacy: ${EMAIL}, or ${PHONE}.${BR}${BUSINESS.legalName}, ${ADDRESS}.`,
  },
  faq: {
    publish: true,
    body: `## Ordering

### How do I place an order?
Add products to your cart, open the cart and go to checkout. Enter your delivery details and choose a payment method.

### Do I need an account?
No, you can order as a guest. With an account you can see your order history and collect reward points.

### How do I confirm a cash-on-delivery order?
We send you a confirmation link after you order. Open it to confirm; orders not confirmed within 48 hours are cancelled automatically.

## Delivery

### Where do you deliver?
To ${AREAS}. See our [shipping policy](/shipping-policy).

### How long does delivery take?
Usually 3 working days.

### How much is shipping?
Nothing: delivery is free on all orders.

### How can I track my order?
Use [order tracking](/orders/track) with your order number.

## Payment

### Which payment methods do you accept?
Cash on delivery: you pay when your order arrives.

## Problems with an order

### Something is wrong with my order. What do I do?
Contact us on ${PHONE} (phone or WhatsApp) or ${EMAIL} with your order number, and we'll sort it out. We're available 24/7.

## Selling

### How can I sell on ${BUSINESS.name}?
[Register as a seller](/vendor/register). We review new stores before their products go live.

## Still need help?
[Contact us](/contact).`,
  },
};

/** Fill what's known in the pages that stay drafts. */
const fills: Record<string, [string, string][]> = {
  terms: [
    ["[[fill: registered business name and address]]", `${BUSINESS.legalName}, ${ADDRESS}`],
    ["[[fill: city whose courts have jurisdiction]]", "The courts of Lahore have jurisdiction."],
  ],
  "return-policy": [
    [
      "[Contact us](/contact) with your order number and photos of the item.",
      `Contact us on ${PHONE} (phone or WhatsApp) or ${EMAIL} with your order number and photos of the item.`,
    ],
  ],
};

async function main() {
  for (const [slug, p] of Object.entries(pages)) {
    const page = await prisma.contentPage.findUnique({ where: { kind_slug: { kind: "page", slug } } });
    if (!page) {
      console.log(`missing  /${slug}`);
      continue;
    }
    if (!page.body.includes("[[fill:")) {
      console.log(`kept     /${slug} (already edited)`);
      continue;
    }
    await prisma.contentPage.update({
      where: { id: page.id },
      data: {
        body: p.body,
        ...(p.seoDescription ? { seoDescription: p.seoDescription } : {}),
        ...(p.publish ? { status: "published", publishedAt: page.publishedAt ?? new Date() } : {}),
      },
    });
    console.log(`${p.publish ? "published" : "updated "} /${slug}`);
  }
  for (const [slug, reps] of Object.entries(fills)) {
    const page = await prisma.contentPage.findUnique({ where: { kind_slug: { kind: "page", slug } } });
    if (!page) continue;
    let body = page.body;
    for (const [a, b] of reps) body = body.replace(a, b);
    if (body !== page.body) {
      await prisma.contentPage.update({ where: { id: page.id }, data: { body } });
      console.log(`filled   /${slug} (still a draft)`);
    }
  }
}

main().finally(() => prisma.$disconnect());
