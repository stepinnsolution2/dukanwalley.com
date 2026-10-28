import Link from "next/link";

// Promises shown above the header. Keep these in line with the shipping policy page.
const ITEMS = [
  {
    label: "Free delivery on every order",
    href: "/shipping-policy",
    icon: "M3 7h11v8H3zM14 10h4l3 3v2h-7M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  },
  {
    label: "Cash on Delivery available",
    href: "/faq",
    icon: "M3 7h18v10H3zM3 11h18M7 15h3",
  },
  {
    label: "Delivered in 3 working days",
    href: "/shipping-policy",
    icon: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  },
  {
    label: "Verified sellers",
    href: "/sellers",
    icon: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3ZM9 12l2 2 4-4",
  },
];

export function TrustBar() {
  return (
    <div className="bg-zinc-900 text-white">
      <ul className="mx-auto flex max-w-[1600px] items-center justify-around gap-4 overflow-x-auto px-3 py-1.5 text-[11px] [scrollbar-width:none] sm:px-4 sm:text-xs md:text-[13px]">
        {ITEMS.map((item, i) => (
          <li key={item.label} className={`shrink-0 ${i > 1 ? "hidden md:block" : ""}`}>
            <Link href={item.href} className="flex items-center gap-1.5 whitespace-nowrap hover:text-teal-300">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={item.icon} />
              </svg>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
