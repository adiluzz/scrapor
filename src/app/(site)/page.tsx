import AdZone from "@/components/ads/AdZone";
import VideoGridWithNativeAd from "@/components/ads/VideoGridWithNativeAd";
import JsonLd from "@/components/site/JsonLd";
import PopularLinksStrip from "@/components/site/PopularLinksStrip";
import SiteSeoIntro from "@/components/site/SiteSeoIntro";
import { listPopularTags } from "@/lib/popular-links";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import { getCurrentSite, getCurrentSiteId } from "@/lib/site";
import {
  buildOpenGraph,
  getSiteBaseUrl,
  keywordsMeta,
  organizationJsonLd,
  searchPageDescription,
  searchPageTitle,
  siteHomeDescription,
  siteHomeTitle,
  websiteJsonLd,
} from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() || "";
  const site = await getCurrentSite();
  const other: Record<string, string> = {};
  if (site.exoSiteVerification) {
    other["6a97888e-site-verification"] = site.exoSiteVerification;
  }
  if (site.juicyAdsSiteVerification) {
    other["juicyads-site-verification"] = site.juicyAdsSiteVerification;
  }

  if (q && site.kind !== "STUDIO") {
    const title = searchPageTitle(q, site);
    const description = searchPageDescription(q, site);
    return {
      title,
      description,
      keywords: keywordsMeta(site, [q]),
      robots: { index: false, follow: true },
      alternates: { canonical: `/search?q=${encodeURIComponent(q)}` },
      openGraph: buildOpenGraph({ title, description, siteName: site.name }),
      other,
    };
  }

  const title = siteHomeTitle(site);
  const description = siteHomeDescription(site);
  return {
    title,
    description,
    keywords: keywordsMeta(site),
    // Next strips trailing slashes from canonicals; the sitemap uses the same
    // slash-free form so Google sees one canonical for the homepage.
    alternates: { canonical: "/" },
    openGraph: buildOpenGraph({
      title,
      description,
      url: "/",
      siteName: site.name,
      image: site.ogImagePath,
    }),
    other,
  };
}

function StudioHome({
  site,
  base,
}: {
  site: Awaited<ReturnType<typeof getCurrentSite>>;
  base: string;
}) {
  return (
    <>
      <JsonLd data={websiteJsonLd(base, site)} />
      <JsonLd data={organizationJsonLd(base, site)} />
      <section className="relative overflow-hidden rounded-3xl border border-zinc-800/80 bg-zinc-900/40 px-6 py-16 sm:px-12 sm:py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background: `radial-gradient(ellipse 70% 60% at 20% 0%, ${site.primaryColor}66, transparent)`,
          }}
        />
        <div className="relative max-w-2xl">
          <p className="text-sm uppercase tracking-[0.25em] text-zinc-500">Productions</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight text-white sm:text-6xl">
            {site.homeH1 || site.name}
          </h1>
          <p className="mt-5 text-lg text-zinc-300">
            {site.tagline || site.seoDescription || "Adult film production company."}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/contact"
              className="rounded-full px-6 py-2.5 text-sm font-semibold text-zinc-950"
              style={{ background: site.primaryColor }}
            >
              Contact us
            </Link>
            <Link
              href="/our-network"
              className="rounded-full border border-zinc-600 px-6 py-2.5 text-sm font-semibold text-zinc-100 hover:border-zinc-400"
            >
              Our Network
            </Link>
          </div>
        </div>
      </section>
      {site.homeIntroHtml ? (
        <div
          className="prose prose-invert mt-10 max-w-none text-zinc-400"
          dangerouslySetInnerHTML={{ __html: site.homeIntroHtml }}
        />
      ) : null}
    </>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const params = parseDiscoveryParams(sp);
  const [siteId, site, base] = await Promise.all([
    getCurrentSiteId(),
    getCurrentSite(),
    getSiteBaseUrl(),
  ]);

  if (site.kind === "STUDIO") {
    return <StudioHome site={site} base={base} />;
  }

  const isSearch = Boolean(params.q);
  const [{ videos, totalPages }, popularTags] = await Promise.all([
    listVideos(siteId, params),
    isSearch ? Promise.resolve([]) : listPopularTags(siteId, 24),
  ]);

  return (
    <>
      {!isSearch && (
        <>
          <JsonLd data={websiteJsonLd(base, site)} />
          <JsonLd data={organizationJsonLd(base, site)} />
        </>
      )}
      {/* Mobile: Exo banner on top. Desktop (lg): sticky 300px right sidebar. Juicy sits in the video grid as a card tile. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        <aside className="lg:order-2 lg:w-[300px] lg:shrink-0">
          <div className="space-y-5 lg:sticky lg:top-20">
            <AdZone zoneId={site.exoZoneHome ?? undefined} insClass={site.exoInsClass} />
          </div>
        </aside>
        <div className="min-w-0 flex-1 lg:order-1">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="min-w-0 text-lg font-semibold break-words text-zinc-100 sm:text-xl">
              {isSearch ? (
                <>Results for &ldquo;{params.q}&rdquo;</>
              ) : (
                site.homeH1 || site.name
              )}
            </h1>
            <Filters />
          </div>
          {!isSearch && (
            <PopularLinksStrip
              title="Popular tags"
              links={popularTags}
              hrefPrefix="/tags"
              className="mb-5"
            />
          )}
          <VideoGridWithNativeAd videos={videos} site={site} />
          <Pagination page={params.page} totalPages={totalPages} />
          {!isSearch && <SiteSeoIntro site={site} />}
        </div>
      </div>
    </>
  );
}
