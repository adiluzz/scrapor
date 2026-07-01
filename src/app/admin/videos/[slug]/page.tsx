import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { thumbUrl, storyboardUrls } from "@/lib/media";
import { formatDuration } from "@/lib/videos";
import VideoPlayer from "@/components/player/VideoPlayer";

export const dynamic = "force-dynamic";

/**
 * Admin video detail / preview. Lives under /admin so it works on the admin
 * subdomain (where middleware rewrites non-/admin paths into /admin) and shows
 * any video regardless of status or soft-delete. Playback of a soft-deleted
 * video is limited (the CDN authorize step rejects deleted videos), but the
 * metadata + thumbnail always render.
 */
export default async function AdminVideoDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireAdmin();
  const { slug } = await params;

  const video = await prisma.video.findFirst({
    where: { siteId: user.siteId, slug },
    include: {
      pornstars: { include: { pornstar: true } },
      tags: { include: { tag: true } },
      heatmap: true,
    },
  });
  if (!video) notFound();

  const [poster, storyboard] = await Promise.all([thumbUrl(video), storyboardUrls(video)]);

  let heatmap: number[] = [];
  try {
    const parsed = video.heatmap?.buckets ? JSON.parse(video.heatmap.buckets) : [];
    if (Array.isArray(parsed)) heatmap = parsed.filter((n) => typeof n === "number");
  } catch {
    heatmap = [];
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link href="/admin/videos" className="text-sm text-zinc-400 hover:text-white">
        ← Back to videos
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-white">{video.title}</h1>
        {video.isDeleted && (
          <span className="rounded bg-red-600/20 px-2 py-0.5 text-xs text-red-400">deleted</span>
        )}
        {video.status !== "READY" && (
          <span className="rounded bg-amber-600/20 px-2 py-0.5 text-xs text-amber-400">{video.status}</span>
        )}
      </div>

      <p className="mt-1 text-sm text-zinc-500">
        {video.viewCount.toLocaleString()} views
        {video.durationSec ? ` · ${formatDuration(video.durationSec)}` : ""}
        {video.sourceSite ? ` · ${video.sourceSite}` : ""}
      </p>

      <div className="mt-4 overflow-hidden rounded-xl bg-black">
        <VideoPlayer videoId={video.id} poster={poster} storyboard={storyboard} heatmap={heatmap} />
      </div>

      {video.sourceUrl && (
        <p className="mt-3 break-all text-xs text-zinc-600">
          Source:{" "}
          <a href={video.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-zinc-400">
            {video.sourceUrl}
          </a>
        </p>
      )}

      {video.description && (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-zinc-400">{video.description}</p>
      )}

      {(video.pornstars.length > 0 || video.tags.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {video.pornstars.map((p) => (
            <span key={p.pornstarId} className="rounded-full bg-pink-600/15 px-3 py-1 text-sm text-pink-400">
              {p.pornstar.name}
            </span>
          ))}
          {video.tags.map((t) => (
            <span key={t.tagId} className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
              {t.tag.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
