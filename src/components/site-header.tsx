import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { CartBackdrop, CartButton, CartPanel } from "@/components/cart-drawer";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentMarket } from "@/lib/market-session";
import { MARKET_CODES, MARKETS, type MarketCode } from "@/lib/markets";
import { CONTAINER } from "@/lib/page-layout";
import { isStaff } from "@/lib/permissions";

function MarketSwitch({ market }: { market: MarketCode }) {
  return (
    <form
      action="/api/market"
      method="post"
      className="flex shrink-0 overflow-hidden rounded-full border border-zinc-300 text-xs"
      aria-label="Shopping country"
    >
      {MARKET_CODES.map((code) => (
        <button
          key={code}
          type="submit"
          name="market"
          value={code}
          aria-pressed={code === market}
          title={`Shop in ${MARKETS[code].name} (${MARKETS[code].currency})`}
          className={code === market ? "bg-teal-700 px-3 py-1 text-white" : "px-3 py-1 text-zinc-600 hover:bg-zinc-100"}
        >
          {code === "AE" ? "UAE" : code}
        </button>
      ))}
    </form>
  );
}

export async function SiteHeader() {
  const session = await auth();
  const market = await getCurrentMarket();
  const role = session?.user?.role;

  // One list of links, shown inline on wider screens and in the Menu on phones.
  const links: { href: string; label: string; strong?: boolean }[] = [
    { href: "/products", label: "Shop" },
    { href: "/sellers", label: "Sellers" },
    { href: "/favorites", label: "Favourites" },
    ...(!session
      ? [
          { href: "/orders/track", label: "Track order" },
          { href: "/auth/login", label: "Sign in" },
        ]
      : []),
    ...(role === "CUSTOMER"
      ? [
          { href: "/account/orders", label: "My orders" },
          { href: "/account/rewards", label: "Points" },
        ]
      : []),
    ...(isStaff(role) ? [{ href: "/admin", label: "Admin", strong: true }] : []),
    ...(role === "SALES" ? [{ href: "/sales", label: "Sales", strong: true }] : []),
    ...(role === "VENDOR" ? [{ href: "/vendor", label: "Vendor", strong: true }] : []),
  ];
  const sell = !session ? (
    <Link href="/vendor/register" className="rounded-full bg-teal-700 px-3 py-1.5 text-white hover:bg-teal-800">
      Sell
    </Link>
  ) : null;

  return (
    <>
      <CartBackdrop />
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur-md">
        <div className={`${CONTAINER} flex items-center justify-between gap-3 py-2.5 md:py-3`}>
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="DukanWalley home">
            <Image src="/logo-mark.png" alt="" width={50} height={40} priority className="h-9 w-auto md:h-10" />
            <Image src="/logo-wordmark.png" alt="DukanWalley" width={139} height={24} priority className="h-5 w-auto md:h-6" />
          </Link>

          {/* Laptops and tablets: everything inline. */}
          <nav className="hidden flex-wrap items-center gap-4 text-sm font-medium text-zinc-700 md:flex">
            <MarketSwitch market={market} />
            {links.map((l) => (
              <Link key={l.href} href={l.href} className={l.strong ? "text-teal-700 hover:underline" : "hover:text-teal-700"}>
                {l.label}
              </Link>
            ))}
            <CartButton />
            {role === "CUSTOMER" ? <span className="hidden text-zinc-500 lg:inline">{session?.user?.email}</span> : null}
            {sell}
            {session ? <SignOutButton /> : null}
          </nav>

          {/* Phones: country, cart and a Menu with the rest. */}
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 md:hidden">
            <MarketSwitch market={market} />
            <CartButton />
            <details className="group relative">
              <summary className="flex list-none items-center gap-1 rounded-full border border-zinc-300 px-3 py-1.5 [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="text-base leading-none">☰</span>
                <span className="sr-only">Menu</span>
              </summary>
              <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg">
                <ul className="flex flex-col">
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className={`block rounded-lg px-3 py-2.5 hover:bg-teal-50 ${l.strong ? "text-teal-700" : "text-zinc-800"}`}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                {sell || session ? (
                  <div className="mt-1 flex items-center justify-between gap-2 border-t border-zinc-100 px-1 pt-2">
                    {sell ? <span className="text-xs text-zinc-500">Have a store?</span> : null}
                    {sell}
                    {session ? <SignOutButton className="px-2 py-1.5 text-zinc-700 hover:text-red-700" /> : null}
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        </div>
        <CartPanel />
      </header>
    </>
  );
}
