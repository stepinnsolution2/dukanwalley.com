"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Admin side menu; the current section is highlighted. */
export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  // The deepest matching entry wins (Products › Import highlights Products, Overview only on /admin).
  const active = items
    .filter((i) => pathname === i.href || (i.href !== "/admin" && pathname.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="flex flex-wrap gap-1 px-2 pb-4 md:flex-col">
      {items.map((item) => {
        const on = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm transition ${
              on ? "bg-teal-700 font-semibold text-white shadow-sm" : "text-zinc-700 hover:bg-teal-50 hover:text-teal-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
