import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { can, isStaff, type Permission } from "@/lib/permissions";
import { SignOutButton } from "@/components/sign-out-button";

const nav: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Overview", permission: "dashboard:view" },
  { href: "/admin/vendors", label: "Vendors", permission: "vendors:view" },
  { href: "/admin/products", label: "Products", permission: "products:view" },
  { href: "/admin/categories", label: "Categories", permission: "catalog:manage" },
  { href: "/admin/orders", label: "Orders", permission: "orders:view" },
  { href: "/admin/reports", label: "Reports", permission: "reports:view" },
  { href: "/admin/newsletter", label: "Newsletter", permission: "newsletter:view" },
  { href: "/admin/sales-team", label: "Sales team", permission: "sales-team:manage" },
  { href: "/admin/live", label: "Live", permission: "live:view" },
  { href: "/admin/banners", label: "Banners", permission: "banners:manage" },
  { href: "/admin/advertising", label: "Advertising", permission: "ads:manage" },
  { href: "/admin/settings", label: "Settings", permission: "settings:manage" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/admin");
  const role = session.user.role;
  if (!isStaff(role)) redirect("/");

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="border-b border-zinc-200 bg-white md:w-56 md:border-b-0 md:border-r">
          <div className="p-4 text-sm font-semibold text-teal-900">
            Admin <span className="font-normal text-zinc-500">· {role.replace("_", " ").toLowerCase()}</span>
          </div>
          <nav className="flex flex-wrap gap-1 px-2 pb-4 md:flex-col">
            {nav
              .filter((item) => can(role, item.permission))
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm text-zinc-700 hover:bg-teal-50 hover:text-teal-900"
                >
                  {item.label}
                </Link>
              ))}
          </nav>
          <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-5 py-3 text-sm">
            <span className="truncate text-xs text-zinc-500">{session.user.email}</span>
            <SignOutButton className="shrink-0 text-zinc-700 hover:text-red-700" />
          </div>
        </aside>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </div>
    </div>
  );
}
