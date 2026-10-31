import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { EmailCapture } from "@/components/email-capture";
import { Providers } from "@/components/providers";
import { integrationSettings } from "@/lib/integration-settings";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baseMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: `${SITE_NAME} — ${SITE_TAGLINE.toLowerCase()}.`,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_PK",
    images: [{ url: "/logo.png", width: 800, height: 514, alt: SITE_NAME }],
  },
  twitter: { card: "summary_large_image" },
};

/** Site-wide metadata plus the Google / Bing ownership codes saved in Admin › Settings. */
export async function generateMetadata(): Promise<Metadata> {
  const s = await integrationSettings();
  return {
    ...baseMetadata,
    verification: {
      ...(s.GOOGLE_SITE_VERIFICATION ? { google: s.GOOGLE_SITE_VERIFICATION } : {}),
      ...(s.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": s.BING_SITE_VERIFICATION } } : {}),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Google Analytics 4, when a measurement ID is saved in Admin › Settings (validated as G-XXXX).
  const settings = await integrationSettings();
  const ga = settings.GA_MEASUREMENT_ID;
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <Providers>
          {children}
          <EmailCapture enabled={settings.EMAIL_POPUP !== "off"} />
        </Providers>
        {ga ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
            <Script id="ga4" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${ga}");`}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  );
}

