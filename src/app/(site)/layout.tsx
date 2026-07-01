import type { Metadata } from "next";
import { getCurrentSite } from "@/lib/site";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  return {
    title: { default: `${site.name} — Free HD Porn Videos`, template: `%s · ${site.name}` },
    description: `Watch free HD porn videos on ${site.name}. Updated daily.`,
    other: { rating: "RTA-5042-1996-1400-1577-RTA" },
  };
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <Footer />
    </div>
  );
}
