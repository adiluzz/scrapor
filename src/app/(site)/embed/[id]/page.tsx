import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSite } from "@/lib/site";
import { loadStoryboardData, thumbUrl } from "@/lib/media";
import { publicOnSite } from "@/lib/publication";
import VideoPlayer from "@/components/player/VideoPlayer";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Sitemap player URL. The watch page stays the canonical page. This page only
 * mounts the same player, which fetches a signed CloudFront playlist after the
 * ad. It never streams the file from this server.
 */
export default async function EmbedPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[a-z0-9]+$/i.test(id)) notFound();

  const site = await getCurrentSite();
  const video = await prisma.video.findFirst({
    where: {
      id,
      isDeleted: false,
      status: "READY",
      sites: publicOnSite(site.id),
    },
    select: {
      id: true,
      title: true,
      siteId: true,
      s3ThumbKey: true,
      s3StoryboardKey: true,
      s3StoryboardVttKey: true,
    },
  });
  if (!video) notFound();

  const [poster, storyboard] = await Promise.all([thumbUrl(video), loadStoryboardData(video)]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="sr-only">{video.title}</h1>
      <VideoPlayer
        videoId={video.id}
        poster={poster}
        storyboard={storyboard}
        heatmap={[]}
        invideoZoneId={site.adsJuicyEnabled ? site.juicyAdsZoneInvideo : null}
        invideoExoFallbackZoneId={site.exoZoneInvideo}
        invideoExoInsClass={site.exoInsClass}
      />
    </div>
  );
}
