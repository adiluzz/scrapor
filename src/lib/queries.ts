import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { thumbUrl, gridCardPreview } from "@/lib/media";
import type { VideoCardPreviewData } from "@/components/site/VideoCardPreview";
import { formatDuration } from "@/lib/videos";

export const PAGE_SIZE = 24;

export type SortKey = "newest" | "oldest" | "popular";

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
    sortRaw === "oldest" || sortRaw === "popular" ? sortRaw : "newest";
  return {
    q: (get("q") || "").trim(),
    min: num("min"),
    max: num("max"),
    sort,
    page: Math.max(1, num("page") || 1),
  };
}

export function buildWhere(
  siteId: string,
  params: DiscoveryParams,
  extra?: Prisma.VideoWhereInput
): Prisma.VideoWhereInput {
  const where: Prisma.VideoWhereInput = {
    siteId,
    isDeleted: false,
    status: "READY", // hide creator uploads still being processed (or failed)
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

async function toCard(v: {
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

/** List videos for a discovery page + total count (for pagination). */
export async function listVideos(
  siteId: string,
  params: DiscoveryParams,
  extra?: Prisma.VideoWhereInput
): Promise<{ videos: VideoCardData[]; total: number; totalPages: number }> {
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
