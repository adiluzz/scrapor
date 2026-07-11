import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSite } from "@/lib/site";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import {
  buildOpenGraph,
  getSiteBaseUrl,
  keywordsMeta,
  tagPageDescription,
  tagPageTitle,
} from "@/lib/seo";
import VideoGrid from "@/components/site/VideoGrid";
import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";
import JsonLd from "@/components/site/JsonLd";

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
  const title = tagPageTitle(tag.name, site);
  const description = tagPageDescription(tag.name, site);
  return {
    title,
    description,
    keywords: keywordsMeta(site, [tag.name, `${tag.name} porn`, `${tag.name} videos`]),
    alternates: { canonical: `/tags/${tag.slug}` },
    openGraph: buildOpenGraph({
      title,
      description,
      url: `/tags/${tag.slug}`,
      siteName: site.name,
    }),
  };
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
  const base = await getSiteBaseUrl();

  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: tagPageTitle(tag.name, site),
          description: tagPageDescription(tag.name, site),
          url: `${base}/tags/${tag.slug}`,
          numberOfItems: total,
        }}
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">
          {tag.name} porn videos{" "}
          <span className="ml-2 text-sm font-normal text-zinc-500">{total} videos</span>
        </h1>
        <Filters />
      </div>
      <VideoGrid videos={videos} />
      <Pagination page={dp.page} totalPages={totalPages} />
    </div>
  );
}
