import type { Metadata } from "next";
import { getCurrentSite, getCurrentSiteId } from "@/lib/site";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import { trackSearch } from "@/lib/search";
import {
  buildOpenGraph,
  keywordsMeta,
  searchPageDescription,
  searchPageTitle,
} from "@/lib/seo";
import VideoGrid from "@/components/site/VideoGrid";
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
      title: "Search piss drinking porn",
      description: `Search piss drinking, golden shower & watersports videos on ${site.name}.`,
      robots: { index: false, follow: true },
      alternates: { canonical: "/search" },
    };
  }

  const title = searchPageTitle(q);
  const description = searchPageDescription(q, site.name);
  return {
    title,
    description,
    keywords: keywordsMeta([q]),
    robots: { index: false, follow: true },
    alternates: { canonical: `/search?q=${encodeURIComponent(q)}` },
    openGraph: buildOpenGraph({ title, description, url: `/search?q=${encodeURIComponent(q)}` }),
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const params = parseDiscoveryParams(sp);
  const siteId = await getCurrentSiteId();

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
        <Filters />
      </div>
      <VideoGrid videos={videos} />
      <Pagination page={params.page} totalPages={totalPages} />
    </>
  );
}
