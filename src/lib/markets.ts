// Country-specific rules. Plain data + pure functions: safe to import from client components.

export type MarketCode = "PK" | "AE";
export type MarketPaymentMethod = "CASH_ON_DELIVERY" | "STRIPE" | "JAZZCASH" | "EASYPAISA" | "CARD";

export const PAYMENT_METHOD_LABELS: Record<MarketPaymentMethod, string> = {
  CASH_ON_DELIVERY: "Cash on delivery",
  JAZZCASH: "JazzCash wallet",
  EASYPAISA: "Easypaisa account",
  CARD: "Debit / credit card",
  STRIPE: "Debit / credit card",
};

export type MarketConfig = {
  code: MarketCode;
  name: string;
  currency: string;
  locale: string;
  /** Digits shown and charged. PKR is priced in whole rupees; AED in fils. */
  fractionDigits: number;
  regionLabel: string;
  regions: readonly string[];
  /** Where orders can be delivered (checkout); defaults to all regions. Sellers may be anywhere. */
  deliveryRegions?: readonly string[];
  /** Local mobile numbers, validated after stripping spaces and dashes. */
  mobilePattern: RegExp;
  mobileExample: string;
  dialCode: string;
  /** Methods offered at checkout, before filtering to gateways configured at runtime. */
  paymentMethods: readonly MarketPaymentMethod[];
  taxName: string;
  /** Value of one reward point in minor units: Rs 1 in PK, AED 0.01 in AE. */
  rewardPointMinor: number;
  idLabels: { nationalId: string; businessRegNo: string; taxRegNo: string };
};

export const MARKETS: Record<MarketCode, MarketConfig> = {
  PK: {
    code: "PK",
    name: "Pakistan",
    currency: "PKR",
    locale: "en-PK",
    fractionDigits: 0,
    regionLabel: "Province",
    regions: [
      "Punjab",
      "Sindh",
      "Khyber Pakhtunkhwa",
      "Balochistan",
      "Islamabad Capital Territory",
      "Gilgit-Baltistan",
      "Azad Jammu and Kashmir",
    ],
    // Delivery currently covers these; see the shipping policy page.
    deliveryRegions: ["Punjab", "Khyber Pakhtunkhwa", "Sindh", "Islamabad Capital Territory"],
    mobilePattern: /^(?:\+92|0092|0)3\d{9}$/,
    mobileExample: "03001234567",
    dialCode: "+92",
    paymentMethods: ["CASH_ON_DELIVERY", "JAZZCASH", "EASYPAISA", "CARD"],
    taxName: "Sales tax",
    rewardPointMinor: 100,
    idLabels: { nationalId: "CNIC", businessRegNo: "NTN", taxRegNo: "STRN" },
  },
  AE: {
    code: "AE",
    name: "United Arab Emirates",
    currency: "AED",
    locale: "en-AE",
    fractionDigits: 2,
    regionLabel: "Emirate",
    regions: [
      "Abu Dhabi",
      "Dubai",
      "Sharjah",
      "Ajman",
      "Umm Al Quwain",
      "Ras Al Khaimah",
      "Fujairah",
    ],
    mobilePattern: /^(?:\+971|00971|0)5\d{8}$/,
    mobileExample: "0501234567",
    dialCode: "+971",
    paymentMethods: ["CASH_ON_DELIVERY", "STRIPE"],
    taxName: "VAT",
    rewardPointMinor: 1,
    idLabels: { nationalId: "Emirates ID", businessRegNo: "Trade licence no.", taxRegNo: "TRN" },
  },
};

export const MARKET_CODES = Object.keys(MARKETS) as MarketCode[];
export const DEFAULT_MARKET: MarketCode = "PK";
export const MARKET_COOKIE = "mp_market";

export function isMarketCode(value: unknown): value is MarketCode {
  return typeof value === "string" && value in MARKETS;
}

/** Local trunk form of an international number, e.g. +923001234567 → 03001234567. */
export function toLocalMobile(market: MarketCode, international: string) {
  const dial = MARKETS[market].dialCode;
  return international.startsWith(dial) ? `0${international.slice(dial.length)}` : international;
}

/** Returns the number in international form (+923001234567), or null if it isn't a local mobile. */
export function normalizeMobile(market: MarketCode, input: string) {
  const m = MARKETS[market];
  const compact = input.replace(/[\s()-]/g, "");
  if (!m.mobilePattern.test(compact)) return null;
  const dial = m.dialCode.slice(1);
  // The pattern guarantees exactly one of: +<dial>, 00<dial>, or a trunk 0.
  const national = compact.startsWith("+")
    ? compact.slice(1 + dial.length)
    : compact.startsWith("00")
      ? compact.slice(2 + dial.length)
      : compact.slice(1);
  return `${m.dialCode}${national}`;
}

/** Minor units (paisa/fils) per smallest amount actually charged: 100 for PKR, 1 for AED. */
export function minorStep(market: MarketCode) {
  return 10 ** (2 - MARKETS[market].fractionDigits);
}

/** True if the price can be charged exactly in this market (whole rupees in PK). */
export function isValidPrice(market: MarketCode, price: number) {
  const minor = Math.round(price * 100);
  return Math.abs(price * 100 - minor) < 1e-6 && minor % minorStep(market) === 0;
}

/** Tax is optional per vendor: only vendors registered for sales tax/VAT may charge it. */
export function taxRuleError(market: MarketCode, vendorTaxRegNo: string | null, salesTaxBps: number | undefined) {
  if (!salesTaxBps || vendorTaxRegNo) return null;
  const m = MARKETS[market];
  return `This vendor isn't registered for ${m.taxName} (no ${m.idLabels.taxRegNo}), so the tax rate must be 0`;
}

export function priceRuleMessage(market: MarketCode) {
  const m = MARKETS[market];
  return m.fractionDigits === 0
    ? `Prices in ${m.name} must be whole ${m.currency} amounts`
    : `Prices in ${m.name} can have at most ${m.fractionDigits} decimal places`;
}

export function formatMoney(market: MarketCode, amount: number | string | { toString(): string }) {
  const m = MARKETS[market];
  return new Intl.NumberFormat(m.locale, {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: m.fractionDigits,
    maximumFractionDigits: m.fractionDigits,
  }).format(Number(amount));
}

/** Regions an order can be delivered to in this market. */
export function deliveryRegions(m: MarketConfig): readonly string[] {
  return m.deliveryRegions ?? m.regions;
}

/** A "was" price must be a valid price above the selling price; null/undefined means none. */
export function compareAtPriceError(market: MarketCode, compareAt: number | null | undefined, price: number) {
  if (compareAt == null) return null;
  if (!isValidPrice(market, compareAt)) return `Compare-at price: ${priceRuleMessage(market)}`;
  if (compareAt <= price) return "The compare-at (“was”) price must be higher than the price";
  return null;
}
