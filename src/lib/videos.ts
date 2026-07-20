import { prisma } from "@/lib/db";
import { enrichPornstarFromTpdbInBackground } from "@/lib/enrich-pornstar-tpdb";
import { slugify } from "@/lib/slug";
import {
  getVerifiedTagDefinition,
  PISS_SWALLOW_VERIFIED_NAME,
  PISS_SWALLOW_VERIFIED_SLUG,
} from "@/lib/verified-tags";

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

/** Resolve a unique slug for admin edits (explicit slug or derived from title). */
export async function resolveAdminVideoSlug(
  siteId: string,
  videoId: string,
  slugInput: string | undefined,
  title: string
): Promise<string> {
  const base = slugify(slugInput?.trim() || title) || "video";
  const taken = await prisma.video.findFirst({
    where: { siteId, slug: base, id: { not: videoId } },
    select: { id: true },
  });
  if (taken) {
    throw new Error(`Slug "${base}" is already in use`);
  }
  return base;
}

/** Site-wide verified badge tag for AI-confirmed piss swallow content. */
export async function ensurePissSwallowVerifiedTag(siteId: string) {
  const def = getVerifiedTagDefinition(PISS_SWALLOW_VERIFIED_SLUG)!;
  return prisma.tag.upsert({
    where: { siteId_slug: { siteId, slug: def.slug } },
    update: { name: def.name, icon: def.icon },
    create: {
      siteId,
      slug: def.slug,
      name: def.name,
      icon: def.icon,
    },
  });
}

/** Link the verified piss swallow badge to a video (idempotent). */
export async function linkPissSwallowVerifiedTag(siteId: string, videoId: string) {
  const tag = await ensurePissSwallowVerifiedTag(siteId);
  await prisma.videoTag.create({ data: { videoId, tagId: tag.id } }).catch(() => {});
}

/** Upsert a Pornstar for a site and link it to a video. */
export async function linkPornstars(siteId: string, videoId: string, names: string[]) {
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    const existing = await prisma.pornstar.findUnique({
      where: { siteId_slug: { siteId, slug } },
      select: { id: true },
    });
    let starId: string;
    let created = false;
    if (existing) {
      await prisma.pornstar.update({
        where: { id: existing.id },
        data: { name },
      });
      starId = existing.id;
    } else {
      const star = await prisma.pornstar.create({
        data: { siteId, slug, name },
      });
      starId = star.id;
      created = true;
    }
    await prisma.videoPornstar
      .create({ data: { videoId, pornstarId: starId } })
      .catch(() => {});
    // Auto-enrich new pornstars from ThePornDB (profile + image).
    if (created) enrichPornstarFromTpdbInBackground(starId);
  }
}

/** Upsert Tags for a site and link them to a video. */
export async function linkTags(siteId: string, videoId: string, names: string[]) {
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    const verifiedDef = getVerifiedTagDefinition(slug);
    const tag = await prisma.tag.upsert({
      where: { siteId_slug: { siteId, slug } },
      update: { name, ...(verifiedDef ? { icon: verifiedDef.icon } : {}) },
      create: {
        siteId,
        slug,
        name,
        ...(verifiedDef ? { icon: verifiedDef.icon } : {}),
      },
    });
    if (verifiedDef && !tag.icon) {
      await prisma.tag.update({
        where: { id: tag.id },
        data: { icon: verifiedDef.icon },
      });
    }
    await prisma.videoTag.create({ data: { videoId, tagId: tag.id } }).catch(() => {});
  }
}

/** Upsert Categories for a site and link them to a video. */
export async function linkCategories(siteId: string, videoId: string, names: string[]) {
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugify(name);
    if (!slug) continue;
    const category = await prisma.category.upsert({
      where: { siteId_slug: { siteId, slug } },
      update: { name },
      create: { siteId, slug, name },
    });
    await prisma.videoCategory
      .create({ data: { videoId, categoryId: category.id } })
      .catch(() => {});
  }
}

/**
 * Create or update a Video from scraped/uploaded metadata, keyed on the globally
 * unique `sourceUrl` (dedup incl. soft-deleted). Links tags + pornstars.
 */
export async function upsertVideoWithMedia(input: {
  siteId: string;
  /** Sites to publish on (VideoSite). Defaults to [siteId]. */
  publishSiteIds?: string[];
  sourceUrl: string;
  title: string;
  description?: string | null;
  durationSec?: number | null;
  sourceSite?: string | null;
  sourceUploadDate?: Date | null;
  scrapeRunId?: string | null;
  creatorId?: string | null;
  status?: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  s3VideoKey?: string | null;
  s3ThumbKey?: string | null;
  s3PreviewKey?: string | null;
  s3StoryboardKey?: string | null;
  s3StoryboardVttKey?: string | null;
  tags?: string[];
  pornstars?: string[];
  categories?: string[];
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
    ...(input.status ? { status: input.status } : {}),
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

  const publishIds =
    input.publishSiteIds !== undefined
      ? [...new Set(input.publishSiteIds)]
      : [input.siteId];
  await prisma.videoSite.createMany({
    data: publishIds.map((siteId) => ({ videoId: video.id, siteId })),
    skipDuplicates: true,
  });

  if (input.pornstars?.length) await linkPornstars(input.siteId, video.id, input.pornstars);
  if (input.tags?.length) await linkTags(input.siteId, video.id, input.tags);
  if (input.categories?.length) await linkCategories(input.siteId, video.id, input.categories);

  return video;
}
