import type { Metadata } from "next";
import Script from "next/script";
import { cookies } from "next/headers";
import { getCurrentSite } from "@/lib/site";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import AgeGate from "@/components/site/AgeGate";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: { default: `${site.name} — Free HD Porn Videos`, template: `%s · ${site.name}` },
    description: `Watch free HD porn videos on ${site.name}. Updated daily.`,
    other: { rating: "RTA-5042-1996-1400-1577-RTA" },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [jar, site] = await Promise.all([cookies(), getCurrentSite()]);
  const ageVerified = jar.get("age_verified")?.value === "1";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ExoClick ad provider (loads once for all public pages). */}
      <Script src="https://a.magsrv.com/ad-provider.js" strategy="afterInteractive" />
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <Footer />
      {!ageVerified && <AgeGate siteName={site.name} />}
    </div>
  );
}
