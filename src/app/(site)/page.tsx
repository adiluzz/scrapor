import AdZone from "@/components/ads/AdZone";
import VideoGridWithNativeAd from "@/components/ads/VideoGridWithNativeAd";
import JsonLd from "@/components/site/JsonLd";
import PopularLinksStrip from "@/components/site/PopularLinksStrip";
import SiteSeoIntro from "@/components/site/SiteSeoIntro";
import { listPopularTags } from "@/lib/popular-links";
import { applyDefaultFeaturedSort, listVideos, parseDiscoveryParams } from "@/lib/queries";
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
import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";
import StudioHome from "@/components/studio/StudioHome";
import { listFeaturedStudioTeam } from "@/lib/studio-talent";

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
  if (site.hilltopAdsSiteVerification) {
    other[site.hilltopAdsSiteVerification] = site.hilltopAdsSiteVerification;
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const params = parseDiscoveryParams(sp);
  const sortParam = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const isSearch = Boolean(params.q);
  applyDefaultFeaturedSort(params, sortParam);
  const [siteId, site, base] = await Promise.all([
    getCurrentSiteId(),
    getCurrentSite(),
    getSiteBaseUrl(),
  ]);

  if (site.kind === "STUDIO") {
    const featured = await listFeaturedStudioTeam(site.id);
    return <StudioHome site={site} base={base} featured={featured} />;
  }

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
            <AdZone
              zoneId={site.exoZoneHome ?? undefined}
              insClass={site.exoInsClass}
              juicyFallbackZoneId={site.juicyAdsZoneBanner}
              juicyEnabled={site.adsJuicyEnabled}
            />
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
            <Filters defaultSort="featured" />
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
