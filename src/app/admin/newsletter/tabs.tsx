"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/newsletter", label: "Contacts" },
  { href: "/admin/newsletter/campaigns", label: "Newsletters" },
];

export function NewsletterTabs() {
  const path = usePathname() ?? "";
  return (
    <nav className="mb-5 flex gap-1 border-b border-zinc-200">
      {TABS.map((t) => {
        const active = t.href === "/admin/newsletter" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${active ? "border-teal-700 text-teal-800" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
