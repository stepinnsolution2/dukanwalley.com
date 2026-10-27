// Creates draft info pages (About, Contact, Shipping, Returns, Privacy, Terms, FAQ) for the owner to
// complete in Admin › Pages & blog. Only facts the site actually implements are stated; anything
// the business must decide is marked [[fill: …]]. Existing pages are never overwritten.
//
//   npx tsx scripts/seed-trust-pages.ts
import "dotenv/config";
import { prisma } from "../src/lib/db";

const AREAS = "Punjab, Khyber Pakhtunkhwa (KPK) and Sindh";

const pages: { slug: string; title: string; order: number; seoDescription: string; body: string }[] = [
  {
    slug: "about",
    title: "About DukanWalley",
    order: 10,
    seoDescription: "DukanWalley is an online marketplace in Pakistan where verified sellers offer fashion, shoes, beauty, electronics and more.",
    body: `DukanWalley is an online marketplace for shoppers in Pakistan. Many sellers list their products in one place, so you can compare designs and prices and order online. **Multiple sellers, endless choices.**

## What you can shop
Women's and men's fashion, kids' clothing, shoes, bags, jewellery and watches, beauty products, mobiles and accessories, computers, electronics, home and kitchen, and sports items. [Browse all products](/products).

## Our sellers
Sellers on DukanWalley are reviewed before their products appear in the shop. Each product page shows which store sells it, and every store has its own page. [See our sellers](/sellers).

## Where we deliver
We currently deliver to ${AREAS}. See our [shipping policy](/shipping-policy) for delivery times and charges.

## Who we are
[[fill: a few sentences about the business: who runs DukanWalley, since when, and the city you operate from]]

## Contact
Questions? Visit our [contact page](/contact).`,
  },
  {
    slug: "contact",
    title: "Contact Us",
    order: 20,
    seoDescription: "Contact DukanWalley customer support by phone, WhatsApp or email for help with orders, delivery and returns.",
    body: `We're happy to help with orders, delivery, returns or anything else.

## Customer support
- **Phone:** [[fill: phone number]]
- **WhatsApp:** [[fill: WhatsApp number]]
- **Email:** [[fill: support email]]
- **Hours:** [[fill: e.g. Monday to Saturday, 10am to 7pm]]

## Business details
- **Business name:** [[fill: registered business name]]
- **Address:** [[fill: business address]]

## Track your order
Already ordered? [Track your order](/orders/track) with your order number.

## Sell on DukanWalley
Have a store? [Register as a seller](/vendor/register).`,
  },
  {
    slug: "shipping-policy",
    title: "Shipping & Delivery Policy",
    order: 30,
    seoDescription: `DukanWalley delivers across ${AREAS}. Delivery times, shipping charges and cash on delivery explained.`,
    body: `## Where we deliver
We currently deliver to addresses in **${AREAS}**. [[fill: confirm whether Islamabad (ICT) is included]]

## Delivery times
- [[fill: e.g. major cities: 2 to 4 working days]]
- [[fill: e.g. other areas: 4 to 7 working days]]

Orders are dispatched after they are confirmed. Delivery may take longer during sales, holidays and bad weather.

## Shipping charges
[[fill: shipping fee per order, and any free-shipping amount, e.g. free delivery on orders above Rs X]]

## Cash on delivery
You can pay in cash when your order arrives. After you place a cash-on-delivery order we send you a link to confirm it; orders that aren't confirmed within 48 hours are cancelled automatically.

## Orders from several sellers
DukanWalley is a marketplace, so items from different sellers may arrive in separate parcels and on different days.

## Tracking
You can [track your order](/orders/track) at any time with your order number.

## Questions
[Contact us](/contact) if your order is late or something isn't right.`,
  },
  {
    slug: "return-policy",
    title: "Return & Refund Policy",
    order: 40,
    seoDescription: "How to return an item bought on DukanWalley, which items can be returned and how refunds are paid.",
    body: `We want you to be happy with your order. If something isn't right, here's how returns work.

## Return period
You can request a return within **[[fill: number]] days** of delivery.

## Items that can be returned
- Items that are damaged, faulty or different from what you ordered
- [[fill: whether change-of-mind returns are accepted, e.g. unused items with original tags and packaging]]

## Items that can't be returned
[[fill: e.g. used cosmetics, undergarments, items marked non-returnable, custom-stitched items]]

## How to request a return
1. [Contact us](/contact) with your order number and photos of the item.
2. [[fill: how the item is sent back, e.g. we arrange pickup / you send it by courier]]
3. We inspect the item when it arrives.

## Return shipping
[[fill: who pays return shipping, e.g. free if the item was faulty or wrong; otherwise paid by the customer]]

## Refunds
Approved refunds are paid by **[[fill: e.g. bank transfer, JazzCash or Easypaisa]]** within **[[fill: number]] working days** of the return being approved.

## Exchanges
[[fill: whether you offer exchanges, e.g. for a different size]]`,
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    order: 50,
    seoDescription: "How DukanWalley collects, uses and protects your personal information.",
    body: `This policy explains what information DukanWalley collects and how we use it. [[fill: date this policy takes effect]]

## Information we collect
- **Account details:** your name, email address, phone number and password (stored encrypted, never in plain text).
- **Order details:** delivery address, the products you order and your order history.
- **Payment details:** online payments are handled by the payment provider (for example JazzCash or Easypaisa, when available). We do not store your card or wallet details.
- **Usage information:** the products you view and add to your cart, used to show relevant suggestions.
- **Cookies:** small files that keep you signed in, remember your cart and your country (Pakistan or UAE), and, if enabled, measure visits with Google Analytics.

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
You can ask us to correct or delete your account information by [contacting us](/contact). [[fill: how long you keep order records, e.g. as required for tax and accounting]]

## Contact
Questions about privacy: [[fill: email address]]`,
  },
  {
    slug: "terms",
    title: "Terms & Conditions",
    order: 60,
    seoDescription: "The terms that apply when you shop or sell on DukanWalley.",
    body: `These terms apply when you use DukanWalley. [[fill: have these terms reviewed by your lawyer before publishing]]

## About the marketplace
DukanWalley is an online marketplace operated by [[fill: registered business name and address]]. Products are listed and sold by independent sellers whose store name appears on each product page.

## Orders
- Placing an order is an offer to buy. An order is accepted when it is confirmed; cash-on-delivery orders must be confirmed using the link we send, otherwise they are cancelled after 48 hours.
- We may cancel an order, for example if an item is out of stock or a price was shown in error; any payment made is refunded.

## Prices and payment
Prices are in Pakistani rupees (PKR) and include applicable taxes unless stated otherwise. Shipping charges are shown at checkout. See our [shipping policy](/shipping-policy).

## Delivery, returns and refunds
See our [shipping policy](/shipping-policy) and [return & refund policy](/return-policy).

## Your account
Keep your password private. You are responsible for activity on your account.

## Sellers
Sellers must list accurate information and genuine products and follow our seller rules. [[fill: link or summary of seller terms]]

## Liability
[[fill: limitation of liability wording, reviewed by your lawyer]]

## Governing law
These terms are governed by the laws of Pakistan. [[fill: city whose courts have jurisdiction]]

## Contact
[Contact us](/contact) with any questions about these terms.`,
  },
  {
    slug: "faq",
    title: "Frequently Asked Questions",
    order: 70,
    seoDescription: "Answers to common questions about ordering, delivery, cash on delivery, returns and selling on DukanWalley.",
    body: `## Ordering

**How do I place an order?**
Add products to your cart, open the cart and go to checkout. Enter your delivery details and choose a payment method.

**Do I need an account?**
[[fill: yes / no; checkout currently asks for your email and phone number]]

**How do I confirm a cash-on-delivery order?**
We send you a confirmation link after you order. Open it to confirm; orders not confirmed within 48 hours are cancelled automatically.

## Delivery

**Where do you deliver?**
To ${AREAS}. See our [shipping policy](/shipping-policy).

**How long does delivery take?**
[[fill: e.g. 2 to 4 working days in major cities]]

**How much is shipping?**
[[fill: shipping charges]]

**How can I track my order?**
Use [order tracking](/orders/track) with your order number.

## Payment

**Which payment methods do you accept?**
Cash on delivery. [[fill: list JazzCash, Easypaisa or cards once they are enabled]]

## Returns

**Can I return an item?**
Yes, within [[fill: number]] days of delivery, subject to our [return & refund policy](/return-policy).

## Selling

**How can I sell on DukanWalley?**
[Register as a seller](/vendor/register). We review new stores before their products go live.

## Still need help?
[Contact us](/contact).`,
  },
];

async function main() {
  for (const p of pages) {
    const exists = await prisma.contentPage.findUnique({ where: { kind_slug: { kind: "page", slug: p.slug } } });
    if (exists) {
      console.log(`kept     /${p.slug} (already exists)`);
      continue;
    }
    await prisma.contentPage.create({
      data: {
        kind: "page",
        slug: p.slug,
        title: p.title,
        body: p.body,
        seoDescription: p.seoDescription,
        status: "draft",
        showInFooter: true,
        footerOrder: p.order,
      },
    });
    console.log(`drafted  /${p.slug}`);
  }
}

main().finally(() => prisma.$disconnect());
