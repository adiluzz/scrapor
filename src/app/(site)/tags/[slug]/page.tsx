import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site";
import { resolveTagForSite } from "@/lib/tag-sites";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import {
  buildOpenGraph,
  getSiteBaseUrl,
  itemListJsonLd,
  keywordsMeta,
  tagPageDescription,
  tagPageTitle,
} from "@/lib/seo";
import VideoGridWithNativeAd from "@/components/ads/VideoGridWithNativeAd";
import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";
import JsonLd from "@/components/site/JsonLd";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const tag = await resolveTagForSite(site.id, slug);
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
      image: site.ogImagePath,
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
  const tag = await resolveTagForSite(site.id, slug);
  if (!tag) notFound();

  const dp = parseDiscoveryParams(await searchParams);
  // Match by slug so shared multi-tenant Tag rows still surface all site videos.
  const { videos, total, totalPages } = await listVideos(site.id, dp, {
    tags: { some: { tag: { slug } } },
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
      <JsonLd
        data={itemListJsonLd({
          name: tagPageTitle(tag.name, site),
          urls: videos.map((v) => `${base}/videos/${v.slug}`),
        })}
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-zinc-100">
          {tag.name} porn videos{" "}
          <span className="ml-2 text-sm font-normal text-zinc-500">{total} videos</span>
        </h1>
        <Filters />
      </div>
      <VideoGridWithNativeAd videos={videos} site={site} />
      <Pagination page={dp.page} totalPages={totalPages} />
    </div>
  );
}
