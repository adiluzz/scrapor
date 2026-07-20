import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSite } from "@/lib/site";
import { listVideos, parseDiscoveryParams } from "@/lib/queries";
import { pornstarHasVerifiedPissSwallowTag, pornstarHasVideosOnSite } from "@/lib/pornstar-sites";
import VideoGridWithNativeAd from "@/components/ads/VideoGridWithNativeAd";
import Filters from "@/components/site/Filters";
import Pagination from "@/components/site/Pagination";
import InPageSearch from "@/components/site/InPageSearch";
import PornstarAvatar from "@/components/site/PornstarAvatar";
import PornstarProfile from "@/components/site/PornstarProfile";
import TagBadge from "@/components/site/TagBadge";
import JsonLd from "@/components/site/JsonLd";
import {
  GOLDEN_DROP_ICON,
  PISS_SWALLOWER_PORNSTAR_LABEL,
  PISS_SWALLOW_VERIFIED_SLUG,
} from "@/lib/verified-tags";
import {
  buildOpenGraph,
  getSiteBaseUrl,
  itemListJsonLd,
  keywordsMeta,
  pornstarPageDescription,
  pornstarPageTitle,
} from "@/lib/seo";
import { pornstarImageUrl } from "@/lib/pornstar-image";

export const dynamic = "force-dynamic";
type SearchParams = Record<string, string | string[] | undefined>;

/** Resolve a pornstar by slug who has published videos on this site (any storage row). */
async function getStar(siteId: string, slug: string) {
  const candidates = await prisma.pornstar.findMany({
    where: { slug, ...pornstarHasVideosOnSite(siteId) },
    orderBy: { name: "asc" },
  });
  if (candidates.length === 0) return null;
  return candidates.find((c) => c.s3Image) ?? candidates[0];
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
  const title = pornstarPageTitle(star.name, site);
  const description = pornstarPageDescription(star.name, site, star.bio);
  const image = pornstarImageUrl(star);
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
      image: image || site.ogImagePath,
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
  // Match by slug so duplicate per-site pornstar rows still surface all site videos.
  const [{ videos, total, totalPages }, isPissSwallower] = await Promise.all([
    listVideos(site.id, dp, {
      pornstars: { some: { pornstar: { slug } } },
    }),
    pornstarHasVerifiedPissSwallowTag(site.id, slug),
  ]);
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
          ...(pornstarImageUrl(star) ? { image: `${base}${pornstarImageUrl(star)}` } : {}),
        }}
      />
      <JsonLd
        data={itemListJsonLd({
          name: pornstarPageTitle(star.name, site),
          urls: videos.map((v) => `${base}/videos/${v.slug}`),
        })}
      />

      <div className="mb-8 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <PornstarAvatar name={star.name} pornstar={star} size="2xl" className="ring-2 ring-zinc-800" />
        <div className="min-w-0 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h1 className="text-2xl font-bold text-zinc-100">{star.name}</h1>
            {isPissSwallower ? (
              <TagBadge
                name={PISS_SWALLOWER_PORNSTAR_LABEL}
                slug={PISS_SWALLOW_VERIFIED_SLUG}
                icon={GOLDEN_DROP_ICON}
                href={`/tags/${PISS_SWALLOW_VERIFIED_SLUG}`}
              />
            ) : null}
          </div>
          <p className="text-sm text-zinc-500">{total} videos</p>
          {star.bio && <p className="mt-1 max-w-2xl text-sm text-zinc-400">{star.bio}</p>}
          <PornstarProfile star={star} />
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InPageSearch placeholder={`Search ${star.name}'s videos…`} />
        <Filters />
      </div>

      <VideoGridWithNativeAd videos={videos} site={site} />
      <Pagination page={dp.page} totalPages={totalPages} />
    </div>
  );
}
