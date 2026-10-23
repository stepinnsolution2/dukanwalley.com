import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
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
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
      { protocol: "https", hostname: "**.amazonaws.com", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
