import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { SalesNotifications } from "./sales-notifications";
import { SignOutButton } from "@/components/sign-out-button";

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/sales");
  if (session.user.role !== "SALES") redirect("/");

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <nav className="flex flex-wrap gap-3 text-sm font-medium text-zinc-700">
            <Link href="/sales" className="hover:text-teal-800">
              Dashboard
            </Link>
            <Link href="/sales/products/new" className="hover:text-teal-800">
              New product
            </Link>
            <Link href="/sales/products" className="hover:text-teal-800">
              My products
            </Link>
            <Link href="/sales/notifications" className="hover:text-teal-800">
              Notifications
            </Link>
          </nav>
          <div className="flex items-center gap-4 text-sm font-medium text-zinc-700">
            <SalesNotifications />
            <SignOutButton className="hover:text-red-700" />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
