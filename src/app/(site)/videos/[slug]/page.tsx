import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentSite } from "@/lib/site";
import { thumbUrl, storyboardUrls } from "@/lib/media";
import { formatDuration } from "@/lib/videos";
import { listVideos } from "@/lib/queries";
import VideoPlayer from "@/components/player/VideoPlayer";
import VideoGrid from "@/components/site/VideoGrid";
import JsonLd from "@/components/site/JsonLd";

export const dynamic = "force-dynamic";

async function getVideo(siteId: string, slug: string) {
  return prisma.video.findFirst({
    where: { siteId, slug, isDeleted: false, status: "READY" },
    include: {
      pornstars: { include: { pornstar: true } },
      tags: { include: { tag: true } },
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
  const description =
    video.description?.slice(0, 300) || `Watch ${video.title} on ${site.name}.`;
  return {
    title: `${video.title} — ${site.name}`,
    description,
    alternates: { canonical: `/videos/${video.slug}` },
    openGraph: { title: video.title, description, type: "video.other" },
  };
}

export default async function VideoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const video = await getVideo(site.id, slug);
  if (!video) notFound();

  const [poster, storyboard] = await Promise.all([
    thumbUrl(video),
    storyboardUrls(video),
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

  return (
    <div className="space-y-6">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: video.title,
          description: video.description || undefined,
          thumbnailUrl: poster || undefined,
          uploadDate: (video.sourceUploadDate || video.createdAt).toISOString(),
          duration: isoDuration(video.durationSec),
        }}
      />

      <div className="mx-auto w-full max-w-5xl">
        <div className="overflow-hidden rounded-xl bg-black">
          <VideoPlayer
            videoId={video.id}
            poster={poster}
            storyboard={storyboard}
            heatmap={heatmap}
          />
        </div>

        <h1 className="mt-4 text-xl font-bold text-zinc-100">{video.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
          <span>{video.viewCount.toLocaleString()} views</span>
          {video.durationSec ? <span>· {formatDuration(video.durationSec)}</span> : null}
          {video.sourceSite ? <span>· {video.sourceSite}</span> : null}
        </div>

        {video.pornstars.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {video.pornstars.map((p) => (
              <Link
                key={p.pornstarId}
                href={`/pornstars/${p.pornstar.slug}`}
                className="rounded-full bg-pink-600/15 px-3 py-1 text-sm font-medium text-pink-400 hover:bg-pink-600/25"
              >
                {p.pornstar.name}
              </Link>
            ))}
          </div>
        )}

        {video.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {video.tags.map((t) => (
              <Link
                key={t.tagId}
                href={`/tags/${t.tag.slug}`}
                className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                {t.tag.name}
              </Link>
            ))}
          </div>
        )}

        {video.description && (
          <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-zinc-400">
            {video.description}
          </p>
        )}
      </div>

      {related.length > 0 && (
        <section className="mx-auto w-full max-w-5xl">
          <h2 className="mb-3 text-lg font-semibold text-zinc-200">Related videos</h2>
          <VideoGrid videos={related} />
        </section>
      )}
    </div>
  );
}
