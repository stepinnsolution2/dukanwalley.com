import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { INTEGRATION_KEYS, SECRET_KEYS } from "@/lib/integration-fields";

// Gateway and SMTP settings saved from Admin › Settings, stored in PlatformSetting "INTEGRATIONS".
// Secrets are encrypted with AES-256-GCM; a saved value wins over the .env variable of the same name.

const SETTING_KEY = "INTEGRATIONS";
const CACHE_MS = 30_000;

type Stored = { values: Record<string, string>; secrets: Record<string, string> };
export type IntegrationSettings = Partial<Record<string, string>>;

function encryptionKey() {
  // A dedicated key lets AUTH_SECRET be rotated without losing saved secrets.
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("SETTINGS_ENCRYPTION_KEY (or AUTH_SECRET) must be set to store secrets");
  return createHash("sha256").update(`integration-settings:${secret}`).digest();
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(":");
}

function decrypt(stored: string) {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("unknown secret format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

async function readStored(): Promise<Stored> {
  const row = await prisma.platformSetting.findUnique({ where: { key: SETTING_KEY } });
  const v = (row?.value ?? {}) as Partial<Stored>;
  return { values: v.values ?? {}, secrets: v.secrets ?? {} };
}

// On globalThis because Next bundles pages and route handlers separately: a module-level
// variable would give each bundle its own cache, and a save would only clear one of them.
const store = globalThis as typeof globalThis & {
  __integrationSettingsCache?: { at: number; saved: IntegrationSettings } | null;
};

function clearCache() {
  store.__integrationSettingsCache = null;
}

/** Saved values only (secrets decrypted). A secret that can't be decrypted counts as unset. */
async function savedSettings(): Promise<IntegrationSettings> {
  const cache = store.__integrationSettingsCache;
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.saved;
  const stored = await readStored();
  const saved: IntegrationSettings = { ...stored.values };
  for (const [k, enc] of Object.entries(stored.secrets)) {
    try {
      saved[k] = decrypt(enc);
    } catch (e) {
      console.error(`[settings] cannot decrypt ${k}; falling back to .env`, e);
    }
  }
  store.__integrationSettingsCache = { at: Date.now(), saved };
  return saved;
}

/** Effective settings: the admin-saved value, else the .env variable. */
export async function integrationSettings(): Promise<IntegrationSettings> {
  const saved = await savedSettings();
  return Object.fromEntries(INTEGRATION_KEYS.map((k) => [k, saved[k] || process.env[k] || undefined]));
}

/** What the admin page may show: non-secret values, and only whether each secret is set. */
export async function integrationSettingsForAdmin() {
  const saved = await savedSettings();
  return Object.fromEntries(
    INTEGRATION_KEYS.map((k) => {
      const inAdmin = !!saved[k];
      const inEnv = !!process.env[k];
      return [k, { inAdmin, inEnv, value: SECRET_KEYS.has(k) ? undefined : saved[k] || process.env[k] || "" }];
    }),
  ) as Record<string, { inAdmin: boolean; inEnv: boolean; value?: string }>;
}

/** Rejects values the gateways or mailer would choke on, so a typo can't break checkout. */
export function validateIntegrationValue(key: string, value: string): string | null {
  if (key.endsWith("_ENV") && !["sandbox", "production"].includes(value)) return "Choose sandbox or production";
  if (key === "PK_CARD_GATEWAY" && !["jazzcash", "easypaisa"].includes(value)) return "Choose JazzCash or Easypaisa";
  if (key === "EASYPAISA_HASH_KEY" && ![16, 24, 32].includes(Buffer.byteLength(value, "utf8"))) {
    return "Easypaisa hash key must be 16, 24 or 32 characters";
  }
  if (key === "GA_MEASUREMENT_ID" && !/^G-[A-Z0-9]{4,20}$/.test(value)) return "Looks like G-XXXXXXXXXX";
  if (key === "FREE_GIFT_MIN_ORDER" && !/^\d{1,7}$/.test(value)) return "Amount in rupees, e.g. 2500";
  if (key === "MARKETING_DAILY_LIMIT" && !/^\d{1,6}$/.test(value)) return "A whole number, e.g. 80";
  if (/_SITE_VERIFICATION$/.test(key) && !/^[A-Za-z0-9_-]{10,120}$/.test(value)) return "Paste the code from the verification tag";
  if (key === "SMTP_PORT" && !/^\d{2,5}$/.test(value)) return "Port must be a number, e.g. 465 or 587";
  if (key === "JAZZCASH_INQUIRY_URL" && !/^https:\/\/\S+$/.test(value)) return "Must be an https:// URL";
  if (key === "ANTHROPIC_API_KEY" && !/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(value)) return "Anthropic keys start with sk-ant-";
  if (key === "AI_DESCRIPTION_MODEL" && !/^claude-[a-z0-9-]+$/.test(value)) return "Choose a model";
  if (value.length > (key === "COD_CHECKOUT_NOTE" || key === "POPUP_TEXT" ? 1000 : 500)) return "Too long";
  return null;
}

/**
 * Applies changes from the admin form. A string saves the value; null removes the saved value
 * (falling back to .env). An empty string removes a plain value but leaves a saved secret alone,
 * because secret inputs are always blank in the form.
 */
export async function saveIntegrationSettings(changes: Record<string, string | null>) {
  const stored = await readStored();
  const changed: string[] = [];
  for (const [key, raw] of Object.entries(changes)) {
    if (!INTEGRATION_KEYS.includes(key)) throw new SettingsValidationError(key, `Unknown setting ${key}`);
    const secret = SECRET_KEYS.has(key);
    const bucket = secret ? stored.secrets : stored.values;
    let value = raw?.trim() ?? null;
    // A pasted <meta … content="CODE"> tag: keep just the code.
    if (value && /_SITE_VERIFICATION$/.test(key)) value = value.match(/content=["']([^"']+)["']/)?.[1] ?? value;
    if (value && key === "GA_MEASUREMENT_ID") value = value.toUpperCase();
    if (value === null || (value === "" && !secret)) {
      if (key in bucket) {
        delete bucket[key];
        changed.push(key);
      }
      continue;
    }
    if (value === "") continue;
    const error = validateIntegrationValue(key, value);
    if (error) throw new SettingsValidationError(key, error);
    const next = secret ? encrypt(value) : value;
    if (secret || bucket[key] !== value) {
      bucket[key] = next;
      changed.push(key);
    }
  }
  if (changed.length) {
    await prisma.platformSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: stored },
      update: { value: stored },
    });
  }
  clearCache();
  return changed;
}

export class SettingsValidationError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}
