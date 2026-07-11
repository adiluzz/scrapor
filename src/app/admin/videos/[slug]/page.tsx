import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { adminThumbUrl, loadStoryboardData } from "@/lib/media";
import { formatDuration } from "@/lib/videos";
import VideoPlayer from "@/components/player/VideoPlayer";
import AdminVideoEditor from "@/components/admin/AdminVideoEditor";
import SiteAssociationEditor from "@/components/admin/SiteAssociationEditor";
import TagBadge from "@/components/site/TagBadge";

export const dynamic = "force-dynamic";

/**
 * Admin video detail / preview. Shows any video regardless of status or
 * soft-delete; playback uses admin-only routes that bypass CDN/ad gates.
 */
export default async function AdminVideoDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;

  const [video, allSites] = await Promise.all([
    prisma.video.findFirst({
      where: { slug },
      include: {
        pornstars: { include: { pornstar: true } },
        tags: { include: { tag: true } },
        heatmap: true,
        sites: { include: { site: { select: { id: true, name: true, domain: true, slug: true, primaryColor: true } } } },
      },
    }),
    prisma.site.findMany({
      orderBy: [{ networkOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, domain: true, slug: true, primaryColor: true },
    }),
  ]);
  if (!video) notFound();

  const [poster, storyboard] = await Promise.all([
    adminThumbUrl(video),
    loadStoryboardData(video, { directS3: video.isDeleted }),
  ]);

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
        <h1 className="text-xl font-bold text-white sm:text-2xl">{video.title}</h1>
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

      {video.sites.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {video.sites.map((vs) => (
            <span
              key={vs.siteId}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300"
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: vs.site.primaryColor }}
              />
              {vs.site.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4">
      <VideoPlayer
        videoId={video.id}
        poster={poster}
        storyboard={storyboard}
        heatmap={heatmap}
        adminPreview
      />
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
            <span key={p.pornstarId} className="rounded-full bg-brand-600/15 px-3 py-1 text-sm text-brand-400">
              {p.pornstar.name}
            </span>
          ))}
          {video.tags.map((t) => (
            <TagBadge
              key={t.tagId}
              name={t.tag.name}
              slug={t.tag.slug}
              icon={t.tag.icon}
            />
          ))}
        </div>
      )}

      <SiteAssociationEditor
        videoId={video.id}
        allSites={allSites}
        initialSiteIds={video.sites.map((vs) => vs.siteId)}
      />

      <AdminVideoEditor videoId={video.id} />
    </div>
  );
}
