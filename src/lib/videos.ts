import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slug";

/** Parse a duration string like "12:34" or "1:02:03" into seconds. */
export function durationToSeconds(input?: string | null): number | null {
  if (!input) return null;
  const parts = input.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/** Format seconds into "M:SS" or "H:MM:SS". */
export function formatDuration(sec?: number | null): string {
  if (!sec || sec < 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function uniqueVideoSlug(siteId: string, title: string, videoId: string): Promise<string> {
  const base = slugify(title) || "video";
  let slug = base;
  const existing = await prisma.video.findUnique({ where: { siteId_slug: { siteId, slug } } });
  if (existing && existing.id !== videoId) slug = `${base}-${videoId.slice(-6)}`;
  return slug;
}

/** Upsert a Pornstar for a site and link it to a video. */
export async function linkPornstars(siteId: string, videoId: string, names: string[]) {
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    const star = await prisma.pornstar.upsert({
      where: { siteId_slug: { siteId, slug } },
      update: { name },
      create: { siteId, slug, name },
    });
    await prisma.videoPornstar
      .create({ data: { videoId, pornstarId: star.id } })
      .catch(() => {});
  }
}

/** Upsert Tags for a site and link them to a video. */
export async function linkTags(siteId: string, videoId: string, names: string[]) {
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    const tag = await prisma.tag.upsert({
      where: { siteId_slug: { siteId, slug } },
      update: { name },
      create: { siteId, slug, name },
    });
    await prisma.videoTag.create({ data: { videoId, tagId: tag.id } }).catch(() => {});
  }
}

/**
 * Create or update a Video from scraped/uploaded metadata, keyed on the globally
 * unique `sourceUrl` (dedup incl. soft-deleted). Links tags + pornstars.
 */
export async function upsertVideoWithMedia(input: {
  siteId: string;
  sourceUrl: string;
  title: string;
  description?: string | null;
  durationSec?: number | null;
  sourceSite?: string | null;
  sourceUploadDate?: Date | null;
  scrapeRunId?: string | null;
  creatorId?: string | null;
  s3VideoKey?: string | null;
  s3ThumbKey?: string | null;
  s3PreviewKey?: string | null;
  s3StoryboardKey?: string | null;
  s3StoryboardVttKey?: string | null;
  tags?: string[];
  pornstars?: string[];
}) {
  const existing = await prisma.video.findUnique({ where: { sourceUrl: input.sourceUrl } });

  const data = {
    siteId: input.siteId,
    title: input.title.slice(0, 400),
    description: input.description ?? null,
    durationSec: input.durationSec ?? null,
    sourceSite: input.sourceSite ?? null,
    sourceUploadDate: input.sourceUploadDate ?? null,
    scrapeRunId: input.scrapeRunId ?? null,
    creatorId: input.creatorId ?? null,
    s3VideoKey: input.s3VideoKey ?? null,
    s3ThumbKey: input.s3ThumbKey ?? null,
    s3PreviewKey: input.s3PreviewKey ?? null,
    s3StoryboardKey: input.s3StoryboardKey ?? null,
    s3StoryboardVttKey: input.s3StoryboardVttKey ?? null,
  };

  let video;
  if (existing) {
    video = await prisma.video.update({ where: { id: existing.id }, data });
  } else {
    video = await prisma.video.create({
      data: { ...data, sourceUrl: input.sourceUrl, slug: "pending" },
    });
    const slug = await uniqueVideoSlug(input.siteId, input.title, video.id);
    video = await prisma.video.update({ where: { id: video.id }, data: { slug } });
  }

  if (input.pornstars?.length) await linkPornstars(input.siteId, video.id, input.pornstars);
  if (input.tags?.length) await linkTags(input.siteId, video.id, input.tags);

  return video;
}
