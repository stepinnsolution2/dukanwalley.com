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
        // On laptops the ad keeps its exact shape and sets the row height; the hero fills beside it.
        className={`relative isolate min-h-[300px] overflow-hidden rounded-2xl bg-gradient-to-br from-teal-900 via-teal-800 to-zinc-900 shadow sm:min-h-[340px] lg:min-h-0 ${
          ads.length ? "" : "lg:aspect-[45/14]"
        }`}
      >
        {banners.length ? (
          <div className="absolute inset-0 -z-10">
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
        {/* Keeps the headline readable on any photo. */}
        <div className="pointer-events-none absolute inset-0 -z-0 bg-gradient-to-r from-black/70 via-black/40 to-black/5" />

        {/* Clicks pass through empty space to the slideshow controls underneath. */}
        <div className="pointer-events-none relative z-10 flex h-full flex-col justify-center px-5 py-8 text-white sm:px-8 [&>*]:pointer-events-auto">
          <h1 className="max-w-xl text-balance text-2xl font-semibold leading-tight drop-shadow sm:text-4xl">
            Online Shopping {inMarket(market)}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-white/90 drop-shadow sm:text-base">
            Products from verified sellers · {SITE_TAGLINE}
          </p>
          <form action="/products" role="search" className="mt-5 flex w-full max-w-xl overflow-hidden rounded-full bg-white shadow-lg">
            <label htmlFor="hero-search" className="sr-only">
              Search products
            </label>
            <input
              id="hero-search"
              name="q"
              type="search"
              required
              placeholder="Search for products, brands and more"
              className="min-w-0 flex-1 bg-transparent px-5 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
            />
            <button type="submit" className="m-1 rounded-full bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800">
              Search
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/products" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50">
              Browse catalog
            </Link>
            <Link href="/sellers" className="rounded-full border border-white/50 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10">
              See all sellers
            </Link>
          </div>
        </div>
      </section>

      {ads.length ? (
        <aside aria-label="Advertisement" className="relative overflow-hidden rounded-2xl bg-zinc-100 shadow" style={{ aspectRatio: `${ad.width} / ${ad.height}` }}>
          <AdRotator ads={ads} label="Sponsored" sizes="(max-width: 1024px) 100vw, 25vw" />
        </aside>
      ) : null}
    </div>
  );
}
