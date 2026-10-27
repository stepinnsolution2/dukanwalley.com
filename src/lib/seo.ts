// Shared SEO helpers: canonical site URL, absolute links and JSON-LD serialisation.

export const SITE_NAME = "DukanWalley";
export const SITE_TAGLINE = "Multiple Sellers, Endless Choices";

/** Contact and address details shown on the trust pages and in Organization structured data. */
export const BUSINESS = {
  name: SITE_NAME,
  legalName: "Dukan Walley",
  phone: "+923261283292",
  phoneDisplay: "+92 326 1283292",
  email: "walleydukan@gmail.com",
  streetAddress: "55-LG Ashiyana Center",
  locality: "Gulberg",
  city: "Lahore",
  region: "Punjab",
  country: "PK",
} as const;

/** Public origin used for canonical URLs, sitemap and structured data. */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://dukanwalley.com").replace(/\/+$/, "");

/** Absolute URL for a site path ("/products/x") or an already-absolute media URL. */
export function absoluteUrl(pathOrUrl: string) {
  return /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** Plain one-line text cut at a word boundary, for meta descriptions (~155 chars). */
export function metaDescription(text: string, max = 155) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so content can't close the tag. */
export function jsonLdString(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export type Crumb = { name: string; path: string };

/** schema.org BreadcrumbList for a trail of [name, path] pairs (Home first). */
export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

/** How shoppers name the market in searches: "Pakistan", "UAE". */
export function marketPlace(market: "PK" | "AE") {
  return market === "AE" ? "UAE" : "Pakistan";
}

/** "in Pakistan" / "in the UAE", for titles like "Online Shopping in Pakistan". */
export function inMarket(market: "PK" | "AE") {
  return market === "AE" ? "in the UAE" : "in Pakistan";
}
