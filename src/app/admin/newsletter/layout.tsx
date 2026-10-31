import { requirePagePermission } from "@/lib/authz";
import { NewsletterTabs } from "./tabs";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePagePermission("newsletter:view");
  return (
    <div>
      <NewsletterTabs />
      {children}
    </div>
  );
}
