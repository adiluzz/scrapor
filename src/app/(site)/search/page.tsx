import type { Metadata } from "next";
import { getCurrentSiteId } from "@/lib/site";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import { trackSearch } from "@/lib/search";
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
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) || "";
  return { title: q ? `${q} videos` : "Search", description: `Search results for ${q}` };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const params = parseDiscoveryParams(sp);
  const siteId = await getCurrentSiteId();

  if (params.q) void trackSearch(siteId, params.q); // fire-and-forget

  const { videos, total, totalPages } = await listVideos(siteId, params);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">
          Results for “{params.q}”
          <span className="ml-2 text-sm font-normal text-zinc-500">{total} videos</span>
        </h1>
        <Filters />
      </div>
      <VideoGrid videos={videos} />
      <Pagination page={params.page} totalPages={totalPages} />
    </>
  );
}
