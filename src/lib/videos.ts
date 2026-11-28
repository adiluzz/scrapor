import { prisma } from "@/lib/db";
import { enrichPornstarFromTpdbInBackground } from "@/lib/enrich-pornstar-tpdb";
import { logger } from "@/lib/logger";
import { slugify, slugifyUnique } from "@/lib/slug";
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

/** Thrown when a name matches more than one stored pornstar. Names are unique. */
export class AmbiguousPornstarError extends Error {
  readonly status = 409;
  constructor(name: string) {
    super(`More than one pornstar is named "${name}". Names must be unique.`);
    this.name = "AmbiguousPornstarError";
  }
}

function isUniqueConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/** A public URL for a new pornstar. Never reads or rewrites an existing slug. */
async function allocatePornstarSlug(siteId: string, name: string): Promise<string> {
  const base = slugify(name) || "pornstar";
  for (const slug of [base, slugifyUnique(name), slugifyUnique(name)]) {
    const taken = await prisma.pornstar.findUnique({
      where: { siteId_slug: { siteId, slug } },
      select: { id: true },
    });
    if (!taken) return slug;
  }
  return slugifyUnique(name);
}

/**
 * Link a pornstar by name only. The slug is not consulted.
 * An existing name is reused and its slug is left unchanged.
 * A profile is created only when that name does not exist yet.
 */
async function resolvePornstarByName(
  siteId: string,
  name: string,
  onAmbiguous: "throw" | "skip"
): Promise<{ id: string; created: boolean } | null> {
  const named = await prisma.pornstar.findMany({
    where: { siteId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (named.length === 1) return { id: named[0].id, created: false };
  if (named.length > 1) {
    if (onAmbiguous === "throw") throw new AmbiguousPornstarError(name);
    logger.warn({ siteId, name, count: named.length }, "duplicate pornstar name; skipped");
    return null;
  }

  const slug = await allocatePornstarSlug(siteId, name);
  try {
    const star = await prisma.pornstar.create({ data: { siteId, slug, name } });
    return { id: star.id, created: true };
  } catch (err) {
    if (!isUniqueConflict(err)) throw err;
    const existing = await prisma.pornstar.findFirst({
      where: { siteId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
    const retrySlug = await allocatePornstarSlug(siteId, name);
    const star = await prisma.pornstar.create({ data: { siteId, slug: retrySlug, name } });
    return { id: star.id, created: true };
  }
}

/** Upsert a Pornstar for a site and link it to a video. */
export async function linkPornstars(siteId: string, videoId: string, names: string[]) {
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const resolved = await resolvePornstarByName(siteId, name, "skip");
    if (!resolved) continue;
    await prisma.videoPornstar
      .create({ data: { videoId, pornstarId: resolved.id } })
      .catch(() => {});
    if (resolved.created) enrichPornstarFromTpdbInBackground(resolved.id);
  }
}

export type PornstarLinkInput = { id?: string; name?: string };

/**
 * Replace a video's pornstar links.
 * Existing profiles are linked by id. A name creates a profile only when that
 * name is not already stored on the site.
 */
export async function replaceVideoPornstars(
  siteId: string,
  videoId: string,
  links: PornstarLinkInput[]
): Promise<void> {
  const starIds: string[] = [];
  for (const link of links) {
    const id = link.id?.trim();
    if (id) {
      const star = await prisma.pornstar.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!star) throw new Error("Pornstar not found");
      starIds.push(star.id);
      continue;
    }
    const name = link.name?.trim();
    if (!name) continue;
    const resolved = await resolvePornstarByName(siteId, name, "throw");
    if (resolved) {
      starIds.push(resolved.id);
      if (resolved.created) enrichPornstarFromTpdbInBackground(resolved.id);
    }
  }

  const unique = [...new Set(starIds)];
  await prisma.$transaction([
    prisma.videoPornstar.deleteMany({ where: { videoId } }),
    ...(unique.length
      ? [
          prisma.videoPornstar.createMany({
            data: unique.map((pornstarId) => ({ videoId, pornstarId })),
          }),
        ]
      : []),
  ]);
}

/** Link one existing pornstar to many videos. Does not create a pornstar. */
export async function linkPornstarToVideos(pornstarId: string, videoIds: string[]) {
  const ids = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))];
  const videos = await prisma.video.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const foundIds = videos.map((video) => video.id);
  const created = foundIds.length
    ? await prisma.videoPornstar.createMany({
        data: foundIds.map((videoId) => ({ videoId, pornstarId })),
        skipDuplicates: true,
      })
    : { count: 0 };
  return {
    linked: created.count,
    alreadyLinked: foundIds.length - created.count,
    missing: ids.length - foundIds.length,
  };
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
