import { getCurrentSiteId } from "@/lib/site";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import VideoGrid from "@/components/site/VideoGrid";
import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const params = parseDiscoveryParams(sp);
  const siteId = await getCurrentSiteId();
  const { videos, total, totalPages } = await listVideos(siteId, params);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">
          {params.q ? `Results for “${params.q}”` : "Latest videos"}
          <span className="ml-2 text-sm font-normal text-zinc-500">{total} videos</span>
        </h1>
        <Filters />
      </div>
      <VideoGrid videos={videos} />
      <Pagination page={params.page} totalPages={totalPages} />
    </>
  );
}
