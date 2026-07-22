import type { Metadata } from "next";
import { getCurrentSite, getCurrentSiteId } from "@/lib/site";
import { applyDefaultFeaturedSort, listVideos, parseDiscoveryParams } from "@/lib/queries";
import { trackSearch } from "@/lib/search";
import {
  buildOpenGraph,
  keywordsMeta,
  searchPageDescription,
  searchPageTitle,
} from "@/lib/seo";
import VideoGridWithNativeAd from "@/components/ads/VideoGridWithNativeAd";
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
  const q = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) || "").trim();
  const site = await getCurrentSite();

  if (!q) {
    return {
      title: "Search",
      description: `Search videos on ${site.name}.`,
      robots: { index: false, follow: true },
      alternates: { canonical: "/search" },
    };
  }

  const title = searchPageTitle(q, site);
  const description = searchPageDescription(q, site);
  return {
    title,
    description,
    keywords: keywordsMeta(site, [q]),
    robots: { index: false, follow: true },
    alternates: { canonical: `/search?q=${encodeURIComponent(q)}` },
    openGraph: buildOpenGraph({
      title,
      description,
      url: `/search?q=${encodeURIComponent(q)}`,
      siteName: site.name,
    }),
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const sortParam = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const params = parseDiscoveryParams(sp);
  applyDefaultFeaturedSort(params, sortParam);
  const siteId = await getCurrentSiteId();
  const site = await getCurrentSite();

  if (params.q) void trackSearch(siteId, params.q);

  const { videos, total, totalPages } = await listVideos(siteId, params);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">
          {params.q ? (
            <>
              {params.q} porn videos
            </>
          ) : (
            "Search"
          )}
          <span className="ml-2 text-sm font-normal text-zinc-500">{total} videos</span>
        </h1>
        <Filters defaultSort="featured" />
      </div>
      <VideoGridWithNativeAd videos={videos} site={site} />
      <Pagination page={params.page} totalPages={totalPages} />
    </>
  );
}
