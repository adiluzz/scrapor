import type { Metadata } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import { getCurrentSite } from "@/lib/site";
import {
  adultMetadataExtras,
  buildOpenGraph,
  keywordsMeta,
  siteHomeDescription,
  siteHomeTitle,
} from "@/lib/seo";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import AgeGate from "@/components/site/AgeGate";
import ConsentModeDefault from "@/components/site/ConsentModeDefault";
import CookieConsent from "@/components/site/CookieConsent";
import GoogleAnalytics from "@/components/site/GoogleAnalytics";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const title = siteHomeTitle(site.name);
  const description = siteHomeDescription(site.name);
  return {
    title: { default: title, template: `%s · ${site.name}` },
    description,
    keywords: keywordsMeta(),
    other: adultMetadataExtras(),
    openGraph: buildOpenGraph({ title, description, url: "/" }),
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [jar, site] = await Promise.all([cookies(), getCurrentSite()]);
  const ageVerified = jar.get("age_verified")?.value === "1";
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <ConsentModeDefault />
      {gaId ? <GoogleAnalytics measurementId={gaId} /> : null}
      {/* ExoClick ad provider (loads once for all public pages). */}
      <Script src="https://a.magsrv.com/ad-provider.js" strategy="afterInteractive" />
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <Footer siteName={site.name} />
      {!ageVerified && <AgeGate siteName={site.name} />}
      <CookieConsent siteName={site.name} />
    </div>
  );
}
