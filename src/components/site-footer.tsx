import Link from "next/link";
import { NewsletterSignup } from "@/components/newsletter-signup";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-3 py-8 sm:px-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-zinc-900">Stay in the loop</p>
          <p className="text-sm text-zinc-600">Deals, new arrivals and price drops — no spam.</p>
        </div>
        <NewsletterSignup />
      </div>
      <div className="border-t border-zinc-100 py-4 text-center text-sm text-zinc-500">
        <Link href="/orders/track" className="hover:underline">Track an order</Link>
        {" · "}
        <Link href="/vendor/register" className="hover:underline">Sell with us</Link>
      </div>
    </footer>
  );
}
