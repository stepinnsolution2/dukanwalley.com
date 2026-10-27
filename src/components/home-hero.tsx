import Image from "next/image";
import Link from "next/link";
import { AdRotator } from "@/components/ad-rotator";
import { Rotator } from "@/components/rotator";
import { prisma } from "@/lib/db";
import { liveAds } from "@/lib/ads";
import { AD_PLACEMENTS } from "@/lib/ad-placements";
import { getCurrentMarket } from "@/lib/market-session";
import { canOptimizeImage } from "@/lib/media-url";
import { inMarket, SITE_TAGLINE } from "@/lib/seo";

// Home page hero: the store's rotating banners (Admin › Banners) with the headline and a site
// search on top; on laptops the "home page top" ad takes the last quarter (below it on phones).
// With no banners the brand gradient shows; with no live ad the hero spans the full width.

async function liveHeroBanners() {
  const now = new Date();
  return prisma.heroBanner.findMany({
    where: {
      isActive: true,
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    select: { id: true, imageUrl: true, alt: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: 10,
  });
}

export async function HomeHero() {
  const [banners, ads, market] = await Promise.all([liveHeroBanners(), liveAds("home_top"), getCurrentMarket()]);
  const ad = AD_PLACEMENTS.home_top;

  return (
    <div className={`grid gap-3 ${ads.length ? "lg:grid-cols-[3fr_1fr]" : ""}`}>
      <section
        // Phones: the banner on top at its own shape, the headline and search on a solid block below.
        // Larger screens: the text over the banner. On laptops the ad sets the row height.
        className={`relative isolate flex flex-col overflow-hidden bg-gradient-to-br from-teal-900 via-teal-800 to-zinc-900 shadow sm:block sm:min-h-[340px] lg:min-h-0 ${
          ads.length ? "" : "lg:aspect-[45/14]"
        }`}
      >
        {banners.length ? (
          <div className="relative aspect-[45/14] w-full sm:absolute sm:inset-0 sm:z-0 sm:aspect-auto">
            <Rotator
              label="Featured"
              slides={banners.map((b, i) => (
                <Image
                  key={b.id}
                  src={b.imageUrl}
                  alt={b.alt}
                  fill
                  priority={i === 0}
                  sizes="(max-width: 1024px) 100vw, 75vw"
                  unoptimized={!canOptimizeImage(b.imageUrl)}
                  className="object-cover"
                />
              ))}
            />
          </div>
        ) : null}
        {/* Keeps the headline readable over the banner (not needed on phones, where it sits below).
            Same layer as the banner but later in the page, so it paints on top of it. */}
        <div className="pointer-events-none absolute inset-0 z-0 hidden bg-gradient-to-r from-black/70 via-black/40 to-black/5 sm:block" />

        {/* Clicks pass through empty space to the slideshow controls underneath. */}
        <div className="pointer-events-none relative z-10 flex flex-col justify-center px-4 py-5 text-white sm:h-full sm:px-8 sm:py-8 [&>*]:pointer-events-auto">
          <h1 className="max-w-xl text-balance text-[1.6rem] font-semibold leading-tight drop-shadow sm:text-4xl">
            Online Shopping {inMarket(market)}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-white/90 drop-shadow sm:mt-1.5 sm:text-base">
            Products from verified sellers<span className="hidden sm:inline"> · {SITE_TAGLINE}</span>
          </p>
          <form action="/products" role="search" className="mt-4 flex w-full max-w-xl overflow-hidden rounded-full bg-white shadow-lg sm:mt-5">
            <label htmlFor="hero-search" className="sr-only">
              Search products
            </label>
            <input
              id="hero-search"
              name="q"
              type="search"
              required
              placeholder="Search products and brands"
              className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 sm:px-5 sm:py-3"
            />
            <button type="submit" className="m-1 shrink-0 rounded-full bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 sm:px-5">
              Search
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-4 sm:gap-3">
            <Link href="/products" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50 sm:px-5">
              Browse catalog
            </Link>
            <Link href="/sellers" className="rounded-full border border-white/50 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 sm:px-5">
              See all sellers
            </Link>
          </div>
        </div>
      </section>

      {ads.length ? (
        <aside aria-label="Advertisement" className="relative overflow-hidden bg-zinc-100 shadow" style={{ aspectRatio: `${ad.width} / ${ad.height}` }}>
          <AdRotator ads={ads} label="Sponsored" sizes="(max-width: 1024px) 100vw, 25vw" />
        </aside>
      ) : null}
    </div>
  );
}
