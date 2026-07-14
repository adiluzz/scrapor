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
import { buildOpenGraph, getSiteBaseUrl, keywordsMeta, creatorPageDescription, creatorPageTitle } from "@/lib/seo";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

async function getCreator(siteId: string, slug: string) {
  return prisma.creatorProfile.findUnique({ where: { siteId_slug: { siteId, slug } } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const c = await getCreator(site.id, slug);
  if (!c) return { title: "Not found" };
  const title = creatorPageTitle(c.displayName, site);
  const description = creatorPageDescription(c.displayName, site, c.bio);
  return {
    title,
    description,
    keywords: keywordsMeta(site, [c.displayName, `${c.displayName} videos`]),
    alternates: { canonical: `/creators/${c.slug}` },
    openGraph: buildOpenGraph({
      title,
      description,
      url: `/creators/${c.slug}`,
      siteName: site.name,
      image: site.ogImagePath,
    }),
  };
}

export default async function CreatorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const creator = await getCreator(site.id, slug);
  if (!creator) notFound();

  const dp = parseDiscoveryParams(await searchParams);
  const { videos, total, totalPages } = await listVideos(site.id, dp, { creatorId: creator.id });
  const base = await getSiteBaseUrl();

  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Person",
          name: creator.displayName,
          description: creatorPageDescription(creator.displayName, site, creator.bio),
          url: `${base}/creators/${creator.slug}`,
        }}
      />

      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-brand-600 text-3xl font-bold text-white">
          {creator.displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{creator.displayName}</h1>
          <p className="text-sm text-zinc-500">{total} videos</p>
          {creator.bio && <p className="mt-1 max-w-2xl text-sm text-zinc-400">{creator.bio}</p>}
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InPageSearch placeholder={`Search ${creator.displayName}'s videos…`} />
        <Filters />
      </div>

      <VideoGrid videos={videos} />
      <Pagination page={dp.page} totalPages={totalPages} />
    </div>
  );
}
