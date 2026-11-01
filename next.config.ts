import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  experimental: {
    // Tailwind's CSS is small (~13 KB gzipped): inlining it removes the render-blocking request.
    inlineCss: true,
  },
  // Keep account, checkout and staff pages out of search results (robots.txt also disallows them).
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    const privateSections = ["admin", "sales", "account", "cart", "checkout", "orders", "favorites", "auth"];
    return [
      ...privateSections.flatMap((s) => [
        { source: `/${s}`, headers: noindex },
        { source: `/${s}/:path*`, headers: noindex },
      ]),
      // Vendor dashboard is private; the public seller sign-up page stays indexable.
      { source: "/vendor", headers: noindex },
      { source: "/vendor/:path((?!register$).*)", headers: noindex },
    ];
  },
  images: {
    // AVIF where the browser supports it (smaller), WebP otherwise.
    formats: ["image/avif", "image/webp"],
    // Widths for fixed-size images, so e.g. the 139px logo and 112px category tiles aren't
    // sent at 256/384px (defaults plus 112, 144, 224, 288).
    imageSizes: [16, 32, 48, 64, 96, 112, 128, 144, 224, 256, 288, 384],
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
      { protocol: "https", hostname: "**.amazonaws.com", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
