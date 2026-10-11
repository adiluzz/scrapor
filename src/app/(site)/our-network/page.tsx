import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentSite, listNetworkSites } from "@/lib/site";
import { buildOpenGraph, keywordsMeta, pageTitleMeta } from "@/lib/seo";
import { LogoMark } from "@/components/brand/Logo";
import StudioFrame from "@/components/studio/StudioFrame";

export async function generateMetadata(): Promise<Metadata> {
  const site = await getCurrentSite();
  const ogTitle = `Our Network · ${site.name}`;
  const description = `Explore the ${site.name} network of specialty adult websites.`;
  return {
    title: pageTitleMeta(ogTitle, site.name),
    description,
    keywords: keywordsMeta(site, ["our network", "adult network"]),
    alternates: { canonical: "/our-network" },
    openGraph: buildOpenGraph({
      title: ogTitle,
      description,
      url: "/our-network",
      siteName: site.name,
    }),
  };
}

export default async function OurNetworkPage() {
  const [site, network] = await Promise.all([getCurrentSite(), listNetworkSites()]);
  const others = network.filter((s) => s.id !== site.id);
  const isStudio = site.kind === "STUDIO";

  const inner = (
    <>
      <section className={isStudio ? "max-w-3xl" : "relative mx-auto max-w-4xl py-10 text-center sm:py-16"}>
        <p
          className={
            isStudio
              ? "studio-kicker text-brand-300/80"
              : "text-sm uppercase tracking-[0.2em] text-zinc-500"
          }
        >
          Network
        </p>
        <h1
          className={
            isStudio
              ? "font-display mt-4 text-5xl text-white sm:text-7xl"
              : "mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl"
          }
        >
          Our Network
        </h1>
        <p className={`mt-4 max-w-xl text-base text-zinc-400 sm:text-lg ${isStudio ? "" : "mx-auto"}`}>
          Specialty sites under one roof — each with its own catalog, brand, and vibe.
        </p>
      </section>

      <ul className={`relative mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3 ${isStudio ? "mt-12" : ""}`}>
        {network.map((s) => {
          const href = `https://${s.domain}`;
          const isCurrent = s.id === site.id;
          return (
            <li key={s.id}>
              <a
                href={href}
                aria-current={isCurrent ? "page" : undefined}
                className={`group flex h-full flex-col items-start gap-4 border p-6 transition ${
                  isStudio
                    ? "border-white/10 bg-white/[0.03] hover:border-brand-400/40"
                    : `rounded-2xl border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-600 hover:bg-zinc-900 ${
                        isCurrent ? "ring-1" : ""
                      }`
                }`}
                style={
                  isCurrent && !isStudio
                    ? { boxShadow: `inset 0 0 0 1px ${s.primaryColor}` }
                    : undefined
                }
                {...(isCurrent ? {} : { target: "_blank", rel: "noopener noreferrer" })}
              >
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-xl"
                  style={{ background: `${s.primaryColor}22` }}
                >
                  <LogoMark
                    className="h-10 w-10"
                    logoKey={s.logoKey}
                    primaryColor={s.primaryColor}
                  />
                </span>
                <div className="text-left">
                  <h2 className="text-xl font-bold text-white group-hover:underline">
                    {s.name}
                    {isCurrent ? (
                      <span className="ml-2 text-xs font-normal text-zinc-500">(you are here)</span>
                    ) : null}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {s.tagline || s.seoDescription || s.domain}
                  </p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide" style={{ color: s.primaryColor }}>
                    {s.domain}
                  </p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>

      {others.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">More network sites coming soon.</p>
      ) : null}

      <div className="relative mt-12 text-center">
        <Link href="/" className="text-sm text-zinc-400 hover:text-white">
          ← Back to {site.name}
        </Link>
      </div>
    </>
  );

  if (isStudio) {
    return <StudioFrame wide>{inner}</StudioFrame>;
  }

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% -20%, ${site.primaryColor}55, transparent)`,
        }}
      />
      {inner}
    </div>
  );
}
