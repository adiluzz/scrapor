import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { thumbUrl, gridCardPreview } from "@/lib/media";
import type { VideoCardPreviewData } from "@/components/site/VideoCardPreview";
import { formatDuration } from "@/lib/videos";

export const PAGE_SIZE = 24;

export type SortKey = "newest" | "oldest" | "popular" | "featured";

/** Discovery params parsed from the URL query string (single source of truth). */
export interface DiscoveryParams {
  q: string;
  min?: number;
  max?: number;
  sort: SortKey;
  page: number;
}

/** Parse Next.js searchParams into typed, validated discovery params. */
export function parseDiscoveryParams(
  sp: Record<string, string | string[] | undefined>
): DiscoveryParams {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const num = (k: string) => {
    const n = parseInt(get(k) || "", 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const sortRaw = get("sort");
  const sort: SortKey =
    sortRaw === "oldest" || sortRaw === "popular" || sortRaw === "featured"
      ? sortRaw
      : "newest";
  return {
    q: (get("q") || "").trim(),
    min: num("min"),
    max: num("max"),
    sort,
    page: Math.max(1, num("page") || 1),
  };
}

/** When the URL has no explicit ?sort=, use featured ranking (views → verified tags → newest). */
export function applyDefaultFeaturedSort(
  params: DiscoveryParams,
  sortParam: string | undefined
): void {
  if (!sortParam) {
    params.sort = "featured";
  }
}

export function buildWhere(
  siteId: string,
  params: DiscoveryParams,
  extra?: Prisma.VideoWhereInput
): Prisma.VideoWhereInput {
  const where: Prisma.VideoWhereInput = {
    sites: { some: { siteId } },
    isDeleted: false,
    status: "READY",
    ...extra,
  };
  if (params.q) {
    where.OR = [
      { title: { contains: params.q, mode: "insensitive" } },
      { description: { contains: params.q, mode: "insensitive" } },
      { tags: { some: { tag: { name: { contains: params.q, mode: "insensitive" } } } } },
      { pornstars: { some: { pornstar: { name: { contains: params.q, mode: "insensitive" } } } } },
    ];
  }
  if (params.min != null || params.max != null) {
    where.durationSec = {};
    if (params.min != null) where.durationSec.gte = params.min;
    if (params.max != null) where.durationSec.lte = params.max;
  }
  return where;
}

export function buildOrderBy(sort: SortKey): Prisma.VideoOrderByWithRelationInput {
  switch (sort) {
    case "oldest":
      return { createdAt: "asc" };
    case "popular":
      return { viewCount: "desc" };
    case "newest":
    default:
      return { createdAt: "desc" };
  }
}

export interface VideoCardData {
  id: string;
  slug: string;
  title: string;
  durationLabel: string;
  viewCount: number;
  createdAt: Date;
  thumb: string;
  preview: VideoCardPreviewData;
  pornstars: { name: string; slug: string }[];
}

export async function toCard(v: {
  id: string;
  slug: string;
  title: string;
  durationSec: number | null;
  viewCount: number;
  createdAt: Date;
  s3ThumbKey: string | null;
  s3PreviewKey: string | null;
  s3StoryboardKey: string | null;
  pornstars?: { pornstar: { name: string; slug: string } }[];
}): Promise<VideoCardData> {
  return {
    id: v.id,
    slug: v.slug,
    title: v.title,
    durationLabel: formatDuration(v.durationSec),
    viewCount: v.viewCount,
    createdAt: v.createdAt,
    thumb: await thumbUrl(v),
    preview: await gridCardPreview(v),
    pornstars: (v.pornstars || []).map((p) => p.pornstar),
  };
}

/**
 * Homepage default: most viewed, then most verified badge tags, then newest.
 */
async function listVideosFeatured(
  siteId: string,
  params: DiscoveryParams,
  extra?: Prisma.VideoWhereInput
): Promise<{ videos: VideoCardData[]; total: number; totalPages: number }> {
  const where = buildWhere(siteId, params, extra);
  const matching = await prisma.video.findMany({
    where,
    select: { id: true },
  });
  const ids = matching.map((v) => v.id);
  if (ids.length === 0) {
    return { videos: [], total: 0, totalPages: 1 };
  }

  const skip = (params.page - 1) * PAGE_SIZE;
  const ranked = await prisma.$queryRaw<{ id: string }[]>`
    SELECT v.id
    FROM "Video" v
    LEFT JOIN (
      SELECT vt."videoId", COUNT(*)::int AS verified_count
      FROM "VideoTag" vt
      INNER JOIN "Tag" t ON t.id = vt."tagId" AND t.icon IS NOT NULL
      GROUP BY vt."videoId"
    ) vc ON vc."videoId" = v.id
    WHERE v.id IN (${Prisma.join(ids)})
    ORDER BY v."viewCount" DESC, COALESCE(vc.verified_count, 0) DESC, v."createdAt" DESC
    LIMIT ${PAGE_SIZE} OFFSET ${skip}
  `;

  const total = ids.length;
  const order = ranked.map((r) => r.id);
  if (order.length === 0) {
    return { videos: [], total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
  }

  const rows = await prisma.video.findMany({
    where: { id: { in: order } },
    include: { pornstars: { include: { pornstar: true }, take: 3 } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sorted = order.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
  const videos = await Promise.all(sorted.map(toCard));
  return { videos, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** List videos for a discovery page + total count (for pagination). */
export async function listVideos(
  siteId: string,
  params: DiscoveryParams,
  extra?: Prisma.VideoWhereInput
): Promise<{ videos: VideoCardData[]; total: number; totalPages: number }> {
  if (params.sort === "featured") {
    return listVideosFeatured(siteId, params, extra);
  }

  const where = buildWhere(siteId, params, extra);
  const [rows, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: buildOrderBy(params.sort),
      skip: (params.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { pornstars: { include: { pornstar: true }, take: 3 } },
    }),
    prisma.video.count({ where }),
  ]);
  const videos = await Promise.all(rows.map(toCard));
  return { videos, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

const AGENT_SEARCH_LIMIT = 100;

/** Search catalog for the video agent (up to 100 popular matches). */
export async function searchAgentVideos(
  siteId: string,
  query: string,
  limit = AGENT_SEARCH_LIMIT
): Promise<VideoCardData[]> {
  const params: DiscoveryParams = { q: query.trim(), sort: "popular", page: 1 };
  const where = buildWhere(siteId, params);
  const rows = await prisma.video.findMany({
    where,
    orderBy: { viewCount: "desc" },
    take: limit,
    include: { pornstars: { include: { pornstar: true }, take: 3 } },
  });
  return Promise.all(rows.map(toCard));
}
