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
import BrandStyle from "@/components/brand/BrandStyle";
import MobileStickyAd from "@/components/ads/MobileStickyAd";
import { listPopularPornstars, listPopularTags } from "@/lib/popular-links";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const title = siteHomeTitle(site);
  const description = siteHomeDescription(site);
  const other: Record<string, string> = {
    ...(adultMetadataExtras() as Record<string, string>),
  };
  if (site.exoSiteVerification) {
    other["6a97888e-site-verification"] = site.exoSiteVerification;
  }
  if (site.juicyAdsSiteVerification) {
    other["juicyads-site-verification"] = site.juicyAdsSiteVerification;
  }
  return {
    title: { default: title, template: `%s · ${site.name}` },
    description,
    keywords: keywordsMeta(site),
    other,
    openGraph: buildOpenGraph({
      title,
      description,
      url: "/",
      siteName: site.name,
      image: site.ogImagePath,
    }),
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [jar, site] = await Promise.all([cookies(), getCurrentSite()]);
  const ageVerified = jar.get("age_verified")?.value === "1";
  // Prefer per-site GA4 id; env is a legacy single-property fallback only.
  const gaId =
    site.gaMeasurementId?.trim() ||
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ||
    "";
  const isStudio = site.kind === "STUDIO";
  const [popularTags, popularPornstars] = isStudio
    ? [[], []]
    : await Promise.all([listPopularTags(site.id, 20), listPopularPornstars(site.id, 16)]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-950 text-zinc-100">
      <BrandStyle primaryColor={site.primaryColor} />
      <ConsentModeDefault />
      {gaId ? <GoogleAnalytics measurementId={gaId} /> : null}
      {!isStudio && site.exoInsClass ? (
        <Script src="https://a.magsrv.com/ad-provider.js" strategy="afterInteractive" />
      ) : null}
      <Header site={site} />
      <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6">{children}</main>
      <Footer
        siteName={site.name}
        isStudio={isStudio}
        popularTags={popularTags}
        popularPornstars={popularPornstars}
      />
      {!isStudio && (
        <MobileStickyAd
          zoneId={site.exoZoneMobileSticky}
          insClass={site.exoInsClass}
          juicyZoneId={site.juicyAdsZoneBanner}
          juicyEnabled={site.adsJuicyEnabled}
        />
      )}
      {!ageVerified && <AgeGate siteName={site.name} />}
      <CookieConsent siteName={site.name} />
    </div>
  );
}
