import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSite } from "@/lib/site";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import VideoGrid from "@/components/site/VideoGrid";
import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

async function getTag(siteId: string, slug: string) {
  return prisma.tag.findUnique({ where: { siteId_slug: { siteId, slug } } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const tag = await getTag(site.id, slug);
  if (!tag) return { title: "Not found" };
  return { title: `${tag.name} porn videos`, description: `Watch ${tag.name} videos on ${site.name}.` };
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const tag = await getTag(site.id, slug);
  if (!tag) notFound();

  const dp = parseDiscoveryParams(await searchParams);
  const { videos, total, totalPages } = await listVideos(site.id, dp, {
    tags: { some: { tagId: tag.id } },
  });

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">
          #{tag.name} <span className="ml-2 text-sm font-normal text-zinc-500">{total} videos</span>
        </h1>
        <Filters />
      </div>
      <VideoGrid videos={videos} />
      <Pagination page={dp.page} totalPages={totalPages} />
    </div>
  );
}
