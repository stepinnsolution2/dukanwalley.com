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
};

export type IntegrationGroup = {
  id: "jazzcash" | "easypaisa" | "cards" | "email";
  title: string;
  description: string;
  fields: readonly IntegrationField[];
  /** Fields that must all be set for the group to count as configured. */
  required: readonly string[];
};

const MODE = [
  { value: "sandbox", label: "Sandbox (testing)" },
  { value: "production", label: "Production (real payments)" },
] as const;

export const INTEGRATION_GROUPS: readonly IntegrationGroup[] = [
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
];

export const INTEGRATION_KEYS = INTEGRATION_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
export const SECRET_KEYS = new Set(INTEGRATION_GROUPS.flatMap((g) => g.fields.filter((f) => f.secret).map((f) => f.key)));
