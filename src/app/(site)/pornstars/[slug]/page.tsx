import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSite } from "@/lib/site";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import VideoGrid from "@/components/site/VideoGrid";
import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";
import InPageSearch from "@/components/site/InPageSearch";
import PornstarAvatar from "@/components/site/PornstarAvatar";
import PornstarProfile from "@/components/site/PornstarProfile";
import JsonLd from "@/components/site/JsonLd";
import {
  buildOpenGraph,
  getSiteBaseUrl,
  keywordsMeta,
  pornstarPageDescription,
} from "@/lib/seo";

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
  const title = `${star.name} Videos`;
  const description = pornstarPageDescription(star.name, site, star.bio);
  return {
    title,
    description,
    keywords: keywordsMeta(site, [star.name, `${star.name} videos`]),
    alternates: { canonical: `/pornstars/${star.slug}` },
    openGraph: buildOpenGraph({
      title,
      description,
      url: `/pornstars/${star.slug}`,
      siteName: site.name,
    }),
  };
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
  const base = await getSiteBaseUrl();

  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: star.name,
          description: pornstarPageDescription(star.name, site, star.bio),
          url: `${base}/pornstars/${star.slug}`,
        }}
      />

      <div className="mb-8 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <PornstarAvatar name={star.name} pornstar={star} size="2xl" className="ring-2 ring-zinc-800" />
        <div className="min-w-0 text-center sm:text-left">
          <h1 className="text-2xl font-bold text-zinc-100">{star.name}</h1>
          <p className="text-sm text-zinc-500">{total} videos</p>
          {star.bio && <p className="mt-1 max-w-2xl text-sm text-zinc-400">{star.bio}</p>}
          <PornstarProfile star={star} />
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
