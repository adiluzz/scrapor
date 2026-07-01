import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";
import VideoGrid from "@/components/site/VideoGrid";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import { getCurrentSiteId } from "@/lib/site";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// Renders: <meta name="replaec" content="replace">  (replace name/content below)
export const metadata: Metadata = {
  other: {
    "6a97888e-site-verification": "b4df9ea4db568763f1b9f8188c253ac9",
  },
};

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
