import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Keep crawlers on the storefront; private areas also send X-Robots-Tag: noindex (next.config.ts).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/media/", "/vendor/register"],
        disallow: [
          "/admin",
          "/sales",
          "/vendor",
          "/account",
          "/cart",
          "/checkout",
          "/orders",
          "/favorites",
          "/auth",
          "/api/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
