// Payment gateway and email settings the owner can enter in Admin › Settings.
// Pure data: safe to import from client components. Keys match the .env variable names,
// which remain the fallback when a value hasn't been saved in the admin.

export type IntegrationField = {
  key: string;
  label: string;
  /** Stored encrypted and never sent back to the browser. */
  secret?: boolean;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  /** A text box of several lines instead of a one-line input. */
  multiline?: boolean;
  /** Used (and shown in the form) while nothing has been saved. */
  defaultValue?: string;
};

export type IntegrationGroup = {
  id: "checkout" | "marketing" | "jazzcash" | "easypaisa" | "cards" | "email" | "analytics" | "ai";
  title: string;
  description: string;
  fields: readonly IntegrationField[];
  /** Fields that must all be set for the group to count as configured. */
  required: readonly string[];
};

const ON_OFF = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const;

const MODE = [
  { value: "sandbox", label: "Sandbox (testing)" },
  { value: "production", label: "Production (real payments)" },
] as const;

export const COD_NOTE_DEFAULT =
  "COD (Cash on Delivery) is a payment option that allows the buyer to pay when the product is delivered to customer. Once the courier has received the money, only then will he give the parcel to the customer.";

export const INTEGRATION_GROUPS: readonly IntegrationGroup[] = [
  {
    id: "checkout",
    title: "Checkout",
    description: "Text shown to buyers on the checkout page.",
    fields: [
      {
        key: "COD_CHECKOUT_NOTE",
        label: "Cash on Delivery note",
        multiline: true,
        defaultValue: COD_NOTE_DEFAULT,
        help: "Shown under the payment choice when the buyer picks Cash on Delivery. Clear the box and save to go back to the default text; type a single - to show no note.",
      },
    ],
    required: [],
  },
  {
    id: "marketing",
    title: "Email marketing",
    description: "Collecting shoppers' emails, cart reminders and newsletters (Admin › Newsletter).",
    fields: [
      {
        key: "EMAIL_POPUP",
        label: "Sign-up box on the site",
        options: ON_OFF,
        defaultValue: "on",
        help: "A pop-up inviting first-time visitors to join for deals, after they pause for a few seconds. Never shown again once closed, never at checkout or to signed-in customers.",
      },
      {
        key: "POPUP_PANEL",
        label: "Pop-up big text",
        defaultValue: "Members get the best deals",
        help: "Large text on the coloured left half of the pop-up, e.g. EID SALE IS COMING.",
      },
      {
        key: "POPUP_HEADLINE",
        label: "Pop-up headline",
        defaultValue: "Join for exclusive deals",
      },
      {
        key: "POPUP_TEXT",
        label: "Pop-up text",
        multiline: true,
        defaultValue: "Subscribe with your email and be the first to hear about sales, festive offers and new arrivals from our sellers.",
      },
      {
        key: "FREE_GIFT_MIN_ORDER",
        label: "Free gift on orders above (Rs), internal",
        placeholder: "2500",
        help: "Never shown to shoppers. Pakistan orders whose items reach this amount are marked 🎁 Free gift in Admin › Orders, so the team can tell the customer after the order and pack a gift. Leave empty for no gift.",
      },
      {
        key: "CART_REMINDERS",
        label: "Cart reminder emails",
        options: ON_OFF,
        defaultValue: "on",
        help: "Up to 4 reminders (after 2 hours, 1 day, 3 days and 7 days) when a shopper leaves items in the cart; sent 9am–9pm only.",
      },
      {
        key: "MARKETING_DAILY_LIMIT",
        label: "Marketing emails per day",
        defaultValue: "80",
        placeholder: "80",
        help: "Cart reminders and newsletters stop for the day at this number; the rest go the next day. Resend's free plan allows 100 emails a day in total (order emails included) and 3,000 a month.",
      },
    ],
    required: [],
  },
  {
    id: "jazzcash",
    title: "JazzCash",
    description: "JazzCash wallet and card payments through the JazzCash hosted payment page.",
    fields: [
      { key: "JAZZCASH_ENV", label: "Mode", options: MODE },
      { key: "JAZZCASH_MERCHANT_ID", label: "Merchant ID" },
      { key: "JAZZCASH_PASSWORD", label: "Password", secret: true },
      { key: "JAZZCASH_INTEGRITY_SALT", label: "Integrity salt", secret: true },
      {
        key: "JAZZCASH_INQUIRY_URL",
        label: "Payment inquiry URL",
        placeholder: "https://…",
        help: "Production only: JazzCash sends this after approval. Used to check payments when a buyer doesn't return.",
      },
    ],
    required: ["JAZZCASH_MERCHANT_ID", "JAZZCASH_PASSWORD", "JAZZCASH_INTEGRITY_SALT"],
  },
  {
    id: "easypaisa",
    title: "Easypaisa",
    description: "Easypaisa account and card payments through Easypay hosted checkout.",
    fields: [
      { key: "EASYPAISA_ENV", label: "Mode", options: MODE },
      { key: "EASYPAISA_STORE_ID", label: "Store ID" },
      { key: "EASYPAISA_HASH_KEY", label: "Hash key", secret: true, help: "16, 24 or 32 characters." },
      { key: "EASYPAISA_USERNAME", label: "Inquiry API username" },
      { key: "EASYPAISA_PASSWORD", label: "Inquiry API password", secret: true },
      { key: "EASYPAISA_ACCOUNT_NUM", label: "Merchant account number" },
    ],
    required: [
      "EASYPAISA_STORE_ID",
      "EASYPAISA_HASH_KEY",
      "EASYPAISA_USERNAME",
      "EASYPAISA_PASSWORD",
      "EASYPAISA_ACCOUNT_NUM",
    ],
  },
  {
    id: "cards",
    title: "Debit / credit cards (Pakistan)",
    description: "Which gateway processes Pakistani cards. It must be configured too.",
    fields: [
      {
        key: "PK_CARD_GATEWAY",
        label: "Card gateway",
        options: [
          { value: "jazzcash", label: "JazzCash" },
          { value: "easypaisa", label: "Easypaisa" },
        ],
      },
    ],
    required: [],
  },
  {
    id: "email",
    title: "Email (SMTP)",
    description: "Order emails and cash-on-delivery confirmation links. Without it, emails are only logged.",
    fields: [
      { key: "SMTP_HOST", label: "SMTP host", placeholder: "mail.dukanwalley.com" },
      { key: "SMTP_PORT", label: "Port", placeholder: "465", help: "465 (SSL) or 587 (STARTTLS)." },
      { key: "SMTP_USER", label: "Username", placeholder: "noreply@dukanwalley.com" },
      { key: "SMTP_PASSWORD", label: "Password", secret: true },
      { key: "EMAIL_FROM", label: "From", placeholder: "DukanWalley <noreply@dukanwalley.com>" },
    ],
    required: ["SMTP_HOST"],
  },
  {
    id: "analytics",
    title: "Analytics & search engines",
    description: "Google Analytics shows visitors and where they come from; the verification codes prove to Google and Bing that you own the site.",
    fields: [
      { key: "GA_MEASUREMENT_ID", label: "Google Analytics 4 measurement ID", placeholder: "G-XXXXXXXXXX", help: "Google Analytics › Admin › Data streams › your web stream." },
      {
        key: "GOOGLE_SITE_VERIFICATION",
        label: "Google Search Console verification",
        placeholder: "paste the HTML tag or just its code",
        help: "Search Console › Add property › URL prefix https://dukanwalley.com › HTML tag.",
      },
      { key: "BING_SITE_VERIFICATION", label: "Bing Webmaster verification", placeholder: "paste the meta tag or its code" },
    ],
    required: [],
  },
  {
    id: "ai",
    title: "AI product descriptions",
    description:
      "Writes detailed, original product descriptions from each product's details and photos (Admin › Products). Uses your Anthropic (Claude) account; you pay Anthropic per description.",
    fields: [
      {
        key: "ANTHROPIC_API_KEY",
        label: "Anthropic API key",
        secret: true,
        placeholder: "sk-ant-…",
        help: "console.anthropic.com › API keys › Create key. Add some credit under Billing first.",
      },
      {
        key: "AI_DESCRIPTION_MODEL",
        label: "Model",
        options: [
          { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (recommended)" },
          { value: "claude-opus-5-5", label: "Claude Opus 5.5 (best writing, costs more)" },
          { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 (cheapest)" },
        ],
      },
    ],
    required: ["ANTHROPIC_API_KEY"],
  },
];

export const INTEGRATION_KEYS = INTEGRATION_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
export const SECRET_KEYS = new Set(INTEGRATION_GROUPS.flatMap((g) => g.fields.filter((f) => f.secret).map((f) => f.key)));
