import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSite } from "@/lib/site";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import VideoGrid from "@/components/site/VideoGrid";
import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";
import InPageSearch from "@/components/site/InPageSearch";
import JsonLd from "@/components/site/JsonLd";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

async function getStar(siteId: string, slug: string) {
  return prisma.pornstar.findUnique({ where: { siteId_slug: { siteId, slug } } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const star = await getStar(site.id, slug);
  if (!star) return { title: "Not found" };
  return { title: `${star.name} videos`, description: star.bio || `Watch ${star.name} videos on ${site.name}.` };
}

export default async function PornstarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const star = await getStar(site.id, slug);
  if (!star) notFound();

  const dp = parseDiscoveryParams(await searchParams);
  const { videos, total, totalPages } = await listVideos(site.id, dp, {
    pornstars: { some: { pornstarId: star.id } },
  });

  return (
    <div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Person", name: star.name, description: star.bio || undefined }} />

      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-pink-600 to-purple-600 text-3xl font-bold text-white">
          {star.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{star.name}</h1>
          <p className="text-sm text-zinc-500">{total} videos</p>
          {star.bio && <p className="mt-1 max-w-2xl text-sm text-zinc-400">{star.bio}</p>}
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InPageSearch placeholder={`Search ${star.name}'s videos…`} />
        <Filters />
      </div>

      <VideoGrid videos={videos} />
      <Pagination page={dp.page} totalPages={totalPages} />
    </div>
  );
}
