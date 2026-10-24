import { AdSlot } from "@/components/ad-slot";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { CONTAINER } from "@/lib/page-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <AdSlot placement="checkout" className={`${CONTAINER} pb-6`} />
      <SiteFooter />
    </>
  );
}
