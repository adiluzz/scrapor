import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";
import VideoGrid from "@/components/site/VideoGrid";
import AdZone from "@/components/ads/AdZone";
import JsonLd from "@/components/site/JsonLd";
import SiteSeoIntro from "@/components/site/SiteSeoIntro";
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

  if (q) {
    const title = searchPageTitle(q);
    const description = searchPageDescription(q, site.name);
    return {
      title,
      description,
      keywords: keywordsMeta([q]),
      robots: { index: false, follow: true },
      alternates: { canonical: `/search?q=${encodeURIComponent(q)}` },
      openGraph: buildOpenGraph({ title, description }),
      other: {
        "6a97888e-site-verification": "b4df9ea4db568763f1b9f8188c253ac9",
      },
    };
  }

  const title = siteHomeTitle(site.name);
  const description = siteHomeDescription(site.name);
  return {
    title,
    description,
    keywords: keywordsMeta(),
    alternates: { canonical: "/" },
    openGraph: buildOpenGraph({ title, description, url: "/" }),
    other: {
      "6a97888e-site-verification": "b4df9ea4db568763f1b9f8188c253ac9",
    },
  };
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
  const { videos, total, totalPages } = await listVideos(siteId, params);
  const isSearch = Boolean(params.q);

  return (
    <>
      {!isSearch && (
        <>
          <JsonLd data={websiteJsonLd(base, site.name)} />
          <JsonLd data={organizationJsonLd(base, site.name)} />
        </>
      )}
      <AdZone zoneId={process.env.EXO_ZONE_HOME} className="mb-5" />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">
          {isSearch ? (
            <>
              Results for &ldquo;{params.q}&rdquo;
            </>
          ) : (
            "Piss Drinking Porn Videos"
          )}
          <span className="ml-2 text-sm font-normal text-zinc-500">{total} videos</span>
        </h1>
        <Filters />
      </div>
      <VideoGrid videos={videos} />
      <Pagination page={params.page} totalPages={totalPages} />
      {!isSearch && <SiteSeoIntro siteName={site.name} />}
    </>
  );
}
