// Newsletter templates and festival presets for Admin › Newsletter › Campaigns.
// Pure data: safe to import from client components. Every slot starts empty; empty slots are
// left out of the email.

export type SlotType = "text" | "textarea" | "image" | "url" | "products" | "color";

export type Slot = {
  key: string;
  label: string;
  type: SlotType;
  help?: string;
  placeholder?: string;
  /** products: most that can be picked. */
  max?: number;
};

export type NewsletterTemplate = {
  id: string;
  name: string;
  description: string;
  slots: readonly Slot[];
};

const hero: Slot = {
  key: "heroImage",
  label: "Banner image",
  type: "image",
  help: "Wide picture at the top, about 1200 × 600 pixels. Leave empty for no banner.",
};
const heroLink: Slot = { key: "heroLink", label: "Banner link", type: "url", placeholder: "https://dukanwalley.com/category/…" };
const accent: Slot = { key: "accent", label: "Theme colour", type: "color", help: "Top border, offer badge and main button. Festival presets set one." };
const headline: Slot = { key: "headline", label: "Headline", type: "text", placeholder: "e.g. Eid Mubarak! Our biggest sale is here" };
const message: Slot = { key: "message", label: "Message", type: "textarea", help: "A short paragraph or two. Leave a blank line between paragraphs." };
const buttonLabel: Slot = { key: "buttonLabel", label: "Button text", type: "text", placeholder: "Shop the sale" };
const buttonLink: Slot = { key: "buttonLink", label: "Button link", type: "url", placeholder: "https://dukanwalley.com/products" };
const productsTitle: Slot = { key: "productsTitle", label: "Products heading", type: "text", placeholder: "e.g. Eid favourites" };
const products: Slot = { key: "products", label: "Products", type: "products", max: 8, help: "Pick up to 8. Shown two per row with photo and price." };
const closing: Slot = { key: "closing", label: "Closing note", type: "textarea", placeholder: "e.g. Order by 25 March for delivery before Eid." };

export const NEWSLETTER_TEMPLATES: readonly NewsletterTemplate[] = [
  {
    id: "festival",
    name: "Festival sale",
    description: "Banner, offer badge, headline and a grid of sale products. For Eid, Christmas, Diwali, 14 August, 11.11 and other sales.",
    slots: [
      accent,
      hero,
      heroLink,
      { key: "badge", label: "Offer badge", type: "text", placeholder: "e.g. Up to 40% off", help: "Short text in a coloured pill above the headline." },
      headline,
      message,
      buttonLabel,
      buttonLink,
      productsTitle,
      products,
      closing,
    ],
  },
  {
    id: "arrivals",
    name: "New arrivals",
    description: "Show off new products. One click fills the products with the latest arrivals.",
    slots: [accent, hero, heroLink, headline, message, productsTitle, products, buttonLabel, buttonLink, closing],
  },
  {
    id: "greeting",
    name: "Greeting / announcement",
    description: "A warm festival greeting or store news, with an optional picture and a few products.",
    slots: [accent, hero, heroLink, headline, message, buttonLabel, buttonLink, productsTitle, { ...products, max: 4 }, closing],
  },
];

export function getTemplate(id: string) {
  return NEWSLETTER_TEMPLATES.find((t) => t.id === id) ?? NEWSLETTER_TEMPLATES[0];
}

export type SlotValues = Record<string, string | string[] | undefined>;

/** Suggested wording and colour per occasion; "Quick fill" only fills slots that are still empty. */
export const OCCASIONS: readonly {
  id: string;
  name: string;
  /** Rough time of year, as a reminder. */
  when: string;
  subject: string;
  preheader: string;
  values: SlotValues;
}[] = [
  {
    id: "ramadan",
    name: "Ramadan",
    when: "Feb–Mar",
    subject: "Ramadan Kareem from DukanWalley 🌙",
    preheader: "Ramadan essentials and special offers.",
    values: {
      accent: "#7a5c12",
      headline: "Ramadan Kareem",
      message: "Wishing you and your family a blessed Ramadan. Get ready for the holy month with our Ramadan picks, delivered to your door.",
      buttonLabel: "Shop Ramadan picks",
      productsTitle: "Ramadan picks",
    },
  },
  {
    id: "eid-ul-fitr",
    name: "Eid ul Fitr",
    when: "Mar–Apr",
    subject: "Eid Mubarak! Your Eid shopping is sorted 🌙",
    preheader: "New Eid outfits and gifts, delivered before Eid.",
    values: {
      accent: "#0f7a4a",
      badge: "Eid Sale",
      headline: "Eid Mubarak! Dress up for Eid",
      message: "Celebrate Eid in style. New shalwar kameez, kurtas, shoes and gifts from our sellers, with cash on delivery across Pakistan.",
      buttonLabel: "Shop the Eid collection",
      productsTitle: "Eid favourites",
      closing: "Order early so your parcel arrives before Eid.",
    },
  },
  {
    id: "eid-ul-adha",
    name: "Eid ul Adha",
    when: "May–Jun",
    subject: "Eid ul Adha Mubarak from DukanWalley",
    preheader: "Eid outfits, gifts and home essentials.",
    values: {
      accent: "#0f7a4a",
      badge: "Eid ul Adha Sale",
      headline: "Eid ul Adha Mubarak",
      message: "May this Eid bring peace and happiness to your home. Shop outfits, gifts and home essentials for Eid ul Adha.",
      buttonLabel: "Shop for Eid",
      productsTitle: "Picked for Eid",
      closing: "Order early so your parcel arrives before Eid.",
    },
  },
  {
    id: "independence-day",
    name: "14 August",
    when: "Aug",
    subject: "Happy Independence Day, Pakistan! 🇵🇰",
    preheader: "Celebrate 14 August with special deals.",
    values: {
      accent: "#01411c",
      badge: "Azadi Sale",
      headline: "Jashn-e-Azadi Mubarak!",
      message: "Celebrate Pakistan's Independence Day with special deals from our sellers.",
      buttonLabel: "Shop the Azadi sale",
      productsTitle: "Azadi deals",
    },
  },
  {
    id: "diwali",
    name: "Diwali",
    when: "Oct–Nov",
    subject: "Happy Diwali from DukanWalley ✨",
    preheader: "Festive outfits, gifts and lights.",
    values: {
      accent: "#c2410c",
      badge: "Diwali Sale",
      headline: "Happy Diwali!",
      message: "Wishing you a bright and joyful Diwali. Find festive outfits and gifts for your loved ones.",
      buttonLabel: "Shop Diwali gifts",
      productsTitle: "Diwali gifts",
    },
  },
  {
    id: "white-friday",
    name: "11.11 / White Friday",
    when: "Nov",
    subject: "Our biggest sale of the year is live",
    preheader: "Limited-time deals across every category.",
    values: {
      accent: "#111827",
      badge: "Mega Sale",
      headline: "The biggest sale of the year",
      message: "Huge savings across fashion, beauty, electronics and more, for a limited time only.",
      buttonLabel: "Shop the sale",
      productsTitle: "Top deals",
      closing: "Deals end soon, and popular items sell out fast.",
    },
  },
  {
    id: "christmas",
    name: "Christmas",
    when: "Dec",
    subject: "Merry Christmas from DukanWalley 🎄",
    preheader: "Gifts for everyone on your list.",
    values: {
      accent: "#b91c1c",
      badge: "Christmas Sale",
      headline: "Merry Christmas!",
      message: "Wishing you joy and peace this Christmas. Find the perfect gifts for everyone on your list.",
      buttonLabel: "Shop Christmas gifts",
      productsTitle: "Christmas gift ideas",
    },
  },
  {
    id: "new-year",
    name: "New Year",
    when: "Dec–Jan",
    subject: "Happy New Year from DukanWalley 🎉",
    preheader: "Start the year with something new.",
    values: {
      accent: "#16325c",
      badge: "New Year Sale",
      headline: "Happy New Year!",
      message: "Thank you for shopping with us. Start the new year with something new from our sellers.",
      buttonLabel: "Shop new arrivals",
      productsTitle: "New for the new year",
    },
  },
];

/** Slots that must be filled before sending. */
export function missingForSend(c: { subject: string; content: SlotValues }) {
  const missing: string[] = [];
  if (!c.subject.trim()) missing.push("Subject");
  if (!String(c.content.headline ?? "").trim()) missing.push("Headline");
  if (!String(c.content.message ?? "").trim() && !(c.content.products as string[] | undefined)?.length) missing.push("Message or products");
  return missing;
}
