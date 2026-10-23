import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: `Sell on ${SITE_NAME} – Seller Registration` },
  description: `Open your store on ${SITE_NAME} and sell to shoppers in Pakistan and the UAE. Register as a seller online.`,
  alternates: { canonical: "/vendor/register" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
