import { requirePagePermission } from "@/lib/authz";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePagePermission("vendors:view");
  return children;
}
