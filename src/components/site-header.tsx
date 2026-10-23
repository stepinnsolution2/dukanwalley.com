import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { CartBackdrop, CartButton, CartPanel } from "@/components/cart-drawer";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentMarket } from "@/lib/market-session";
import { MARKET_CODES, MARKETS } from "@/lib/markets";
import { CONTAINER } from "@/lib/page-layout";
import { isStaff } from "@/lib/permissions";

export async function SiteHeader() {
  const session = await auth();
  const market = await getCurrentMarket();
  return (
    <>
      <CartBackdrop />
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur-md">
        <div className={`${CONTAINER} flex flex-wrap items-center justify-between gap-3 py-3`}>
          <Link href="/" className="flex items-center gap-2" aria-label="DukanWalley home">
            <Image src="/logo-mark.png" alt="" width={50} height={40} priority className="h-10 w-auto" />
            <Image
              src="/logo-wordmark.png"
              alt="DukanWalley"
              width={139}
              height={24}
              priority
              className="h-6 w-auto"
            />
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-700 sm:gap-4">
            <form
              action="/api/market"
              method="post"
              className="flex overflow-hidden rounded-full border border-zinc-300 text-xs"
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
                  className={
                    code === market
                      ? "bg-teal-700 px-3 py-1 text-white"
                      : "px-3 py-1 text-zinc-600 hover:bg-zinc-100"
                  }
                >
                  {code === "AE" ? "UAE" : code}
                </button>
              ))}
            </form>
            <Link href="/products" className="hover:text-teal-700">
              Shop
            </Link>
            <Link href="/sellers" className="hover:text-teal-700">
              Sellers
            </Link>
            <Link href="/favorites" className="hover:text-teal-700">
              Favourites
            </Link>
            <CartButton />
            {!session && (
              <>
                <Link href="/orders/track" className="hover:text-teal-700">
                  Track order
                </Link>
                <Link href="/auth/login" className="hover:text-teal-700">
                  Sign in
                </Link>
                <Link
                  href="/vendor/register"
                  className="rounded-full bg-teal-700 px-3 py-1.5 text-white hover:bg-teal-800"
                >
                  Sell
                </Link>
              </>
            )}
            {session?.user?.role === "CUSTOMER" && (
              <>
                <Link href="/account/orders" className="hover:text-teal-700">
                  My orders
                </Link>
                <Link href="/account/rewards" className="hover:text-teal-700">
                  Points
                </Link>
                <span className="hidden text-zinc-500 sm:inline">
                  {session.user.email}
                </span>
              </>
            )}
            {isStaff(session?.user?.role) ? (
              <Link href="/admin" className="text-teal-700 hover:underline">
                Admin
              </Link>
            ) : null}
            {session?.user?.role === "SALES" ? (
              <Link href="/sales" className="text-teal-700 hover:underline">
                Sales
              </Link>
            ) : null}
            {session?.user?.role === "VENDOR" ? (
              <Link href="/vendor" className="text-teal-700 hover:underline">
                Vendor
              </Link>
            ) : null}
            {session ? <SignOutButton /> : null}
          </nav>
        </div>
        <CartPanel />
      </header>
    </>
  );
}
