import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSite, parseSeoKeywords } from "@/lib/site";
import { thumbUrl, loadStoryboardData } from "@/lib/media";
import { formatDuration } from "@/lib/videos";
import { getCurrentUser } from "@/lib/session";
import { listVideos } from "@/lib/queries";
import VideoPlayer from "@/components/player/VideoPlayer";
import VideoGrid from "@/components/site/VideoGrid";
import JsonLd from "@/components/site/JsonLd";
import {
  breadcrumbJsonLd,
  buildOpenGraph,
  getSiteBaseUrl,
  keywordsMeta,
  pageTitleMeta,
  videoObjectJsonLd,
  videoPageDescription,
  videoPageTitle,
} from "@/lib/seo";
import { publicVideoContentUrl, publicVideoThumbnailUrl } from "@/lib/video-sitemap";
import AdZone from "@/components/ads/AdZone";
import ExoFullscreenOverlay from "@/components/ads/ExoFullscreenOverlay";
import ExoPopunder from "@/components/ads/ExoPopunder";
import FloatingCornerAd from "@/components/ads/FloatingCornerAd";
import JuicyAdZone from "@/components/ads/JuicyAdZone";
import StripchatWidget from "@/components/ads/StripchatWidget";
import TagBadge from "@/components/site/TagBadge";
import { isVerifiedBadgeTag } from "@/lib/verified-tags";

export const dynamic = "force-dynamic";

async function getVideo(siteId: string, slug: string, includeHidden = false) {
  return prisma.video.findFirst({
    // Public visitors only see live, READY videos. Admins can preview any
    // video (soft-deleted or still processing) via the admin panel link.
    where: {
      slug,
      sites: { some: { siteId } },
      ...(includeHidden ? {} : { isDeleted: false, status: "READY" }),
    },
    include: {
      pornstars: { include: { pornstar: true } },
      tags: { include: { tag: true } },
      categories: { include: { category: true } },
      heatmap: true,
    },
  });
}

function isoDuration(sec: number | null): string | undefined {
  if (!sec) return undefined;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s ? `${s}S` : ""}` || "PT0S";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const video = await getVideo(site.id, slug);
  if (!video) return { title: "Not found" };
  const description = videoPageDescription(video.title, site, video.description, {
    tags: video.tags.map((t) => t.tag.name).join(", "),
    duration: video.durationSec ? formatDuration(video.durationSec) : "",
  });
  const tagNames = video.tags.map((t) => t.tag.name);
  const categoryNames = video.categories.map((c) => c.category.name);
  const title = videoPageTitle(video.title, site);
  const base = await getSiteBaseUrl();
  const poster = publicVideoThumbnailUrl(base, video.id);
  return {
    title: pageTitleMeta(title, site.name),
    description,
    keywords: keywordsMeta(site, [...categoryNames, ...tagNames, video.title]),
    alternates: { canonical: `/videos/${video.slug}` },
    openGraph: buildOpenGraph({
      title,
      description,
      url: `/videos/${video.slug}`,
      image: poster,
      type: "video.other",
      siteName: site.name,
    }),
    twitter: { card: "summary_large_image", title, description, images: poster ? [poster] : undefined },
  };
}

export default async function VideoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await getCurrentSite();
  let video = await getVideo(site.id, slug);
  let adminPreview = false;
  if (!video) {
    const user = await getCurrentUser();
    if (user?.role === "ADMIN") {
      video = await getVideo(site.id, slug, true);
      adminPreview = Boolean(video);
    }
  }
  if (!video) notFound();

  const [poster, storyboard, base] = await Promise.all([
    thumbUrl(video),
    loadStoryboardData(video),
    getSiteBaseUrl(),
  ]);

  let heatmap: number[] = [];
  try {
    const parsed = video.heatmap?.buckets ? JSON.parse(video.heatmap.buckets) : [];
    if (Array.isArray(parsed)) heatmap = parsed.filter((n) => typeof n === "number");
  } catch {
    heatmap = [];
  }

  // Related: other videos sharing a pornstar, else newest — always excluding self.
  const pornstarId = video.pornstars[0]?.pornstarId;
  const { videos: related } = await listVideos(
    site.id,
    { q: "", sort: pornstarId ? "newest" : "popular", page: 1 },
    {
      id: { not: video.id },
      ...(pornstarId ? { pornstars: { some: { pornstarId } } } : {}),
    }
  );

  const pageUrl = `${base}/videos/${video.slug}`;
  const tagNames = video.tags.map((t) => t.tag.name);

  return (
    <div className="relative space-y-6">
      {!adminPreview && (
        <>
          <ExoFullscreenOverlay
            zoneId={site.exoZoneVideoFullscreen}
            insClass={site.exoInsClass}
          />
          <ExoPopunder
            zoneId={site.exoZonePopunder}
            enabled={site.adsPopunderEnabled}
            insClass={site.exoInsClass}
          />
          <FloatingCornerAd
            zoneId={site.juicyAdsZoneVidfloat}
            enabled={site.adsJuicyEnabled}
          />
        </>
      )}
      <JsonLd
        data={videoObjectJsonLd({
          title: video.title,
          description: video.description,
          thumbnailUrl: publicVideoThumbnailUrl(base, video.id),
          contentUrl: publicVideoContentUrl(base, video.id),
          uploadDate: (video.sourceUploadDate || video.createdAt).toISOString(),
          durationIso: isoDuration(video.durationSec),
          pageUrl,
          viewCount: video.viewCount,
          tags: tagNames,
          siteName: site.name,
          siteKeywords: parseSeoKeywords(site.seoKeywords),
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", url: base },
          { name: "Videos", url: `${base}/` },
          { name: video.title, url: pageUrl },
        ])}
      />

      <div className="mx-auto w-full max-w-7xl space-y-6">
        {adminPreview && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
            Admin preview — this video is{" "}
            {video.isDeleted ? "deleted" : video.status !== "READY" ? "still processing" : "hidden"} and not
            visible to the public.
          </div>
        )}
        <VideoPlayer
          videoId={video.id}
          poster={poster}
          storyboard={storyboard}
          heatmap={heatmap}
          invideoZoneId={site.adsJuicyEnabled && !adminPreview ? site.juicyAdsZoneInvideo : null}
        />

        <div className="w-full">
          <h1 className="text-lg font-bold break-words text-zinc-100 sm:text-xl">{video.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
            <span>{video.viewCount.toLocaleString()} views</span>
            {video.durationSec ? <span>· {formatDuration(video.durationSec)}</span> : null}
          </div>

          {video.pornstars.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {video.pornstars.map((p) => (
                <Link
                  key={p.pornstarId}
                  href={`/pornstars/${p.pornstar.slug}`}
                  className="rounded-full bg-brand-600/15 px-3 py-1 text-sm font-medium text-brand-400 hover:bg-brand-600/25"
                >
                  {p.pornstar.name}
                </Link>
              ))}
            </div>
          )}

          {video.categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {video.categories.map((c) => (
                <span
                  key={c.categoryId}
                  className="rounded-full bg-zinc-800 px-3 py-1 text-sm text-zinc-300"
                >
                  {c.category.name}
                </span>
              ))}
            </div>
          )}

          {video.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {video.tags.map((t) => (
                <TagBadge
                  key={t.tagId}
                  name={t.tag.name}
                  slug={t.tag.slug}
                  icon={t.tag.icon}
                  href={`/tags/${t.tag.slug}`}
                  className={isVerifiedBadgeTag(t.tag) ? "" : "hover:bg-zinc-700"}
                />
              ))}
            </div>
          )}

          {video.description && (
            <p className="mt-4 whitespace-pre-line break-words text-sm leading-relaxed text-zinc-400">
              {video.description}
            </p>
          )}

          {/* Double banner: side-by-side on desktop, stacked on mobile. */}
          <div className="mt-6 flex flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
            <AdZone zoneId={site.exoZoneUnderPlayer} insClass={site.exoInsClass} />
            {site.adsJuicyEnabled && <JuicyAdZone zoneId={site.juicyAdsZoneBanner} enabled />}
          </div>
          {site.kind !== "STUDIO" && site.adsCamWidgetEnabled && (
            <div className="mt-6">
              <StripchatWidget
                widgetId={site.stripchatWidgetId}
                affiliateUrl={site.stripchatAffiliateUrl}
                enabled
              />
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mx-auto w-full max-w-7xl">
          <h2 className="mb-3 text-lg font-semibold text-zinc-200">Related videos</h2>
          <VideoGrid videos={related} />
        </section>
      )}
    </div>
  );
}
