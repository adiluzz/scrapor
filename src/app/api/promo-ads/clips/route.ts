import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { guardAdmin } from "@/lib/admin-guard";
import { adClipsSiteWhere } from "@/lib/ad-clips";
import { isClipPublishableVideo } from "@/lib/ad-clips-publish";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 48;

const detectionInclude = {
  feedback: { select: { approved: true, createdAt: true } },
  run: {
    select: {
      id: true,
      userPrompt: true,
      siteId: true,
    },
  },
} satisfies Prisma.VideoAgentDetectionInclude;

type DetectionRow = Prisma.VideoAgentDetectionGetPayload<{ include: typeof detectionInclude }>;

/**
 * Read-only ad-clip listing. Do not enqueue, publish, or write promo-ad rows here —
 * the ad-generator owns compile progress.
 */
export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const label = url.searchParams.get("label")?.trim();
  const siteId = url.searchParams.get("siteId");
  const review = url.searchParams.get("review") === "pending" ? "pending" : "approved";
  const compiledOnly = url.searchParams.get("compiled") === "1";
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
  const pageParam = url.searchParams.get("page");
  const page = Math.min(10_000, Math.max(1, parseInt(pageParam || "1", 10) || 1));

  const reviewWhere =
    review === "pending" ? { feedback: null } : { feedback: { approved: true } };

  const where: Prisma.VideoAgentDetectionWhereInput = {
    ...adClipsSiteWhere(auth, siteId),
    ...reviewWhere,
    ...(compiledOnly
      ? { label: { equals: "compiled", mode: "insensitive" } }
      : label
        ? { label: { contains: label, mode: "insensitive" } }
        : {}),
    ...(q
      ? {
          OR: [
            { videoTitle: { contains: q, mode: "insensitive" } },
            { label: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const useCursor = Boolean(cursor) && pageParam === null && !compiledOnly && !q;

  const [detections, total] = await Promise.all([
    prisma.videoAgentDetection.findMany({
      where,
      orderBy: useCursor ? { createdAt: "desc" } : [{ createdAt: "desc" }, { id: "desc" }],
      take: useCursor ? PAGE_SIZE + 1 : PAGE_SIZE,
      ...(useCursor
        ? { cursor: { id: cursor! }, skip: 1 }
        : { skip: (page - 1) * PAGE_SIZE }),
      include: detectionInclude,
    }),
    useCursor ? Promise.resolve(null) : prisma.videoAgentDetection.count({ where }),
  ]);
  const hasMore = useCursor ? detections.length > PAGE_SIZE : total! > page * PAGE_SIZE;
  const items = useCursor && hasMore ? detections.slice(0, PAGE_SIZE) : detections;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;
  const totalPages = total == null ? null : Math.max(1, Math.ceil(total / PAGE_SIZE));

  const clips = await serializeClips(items);

  return NextResponse.json({
    clips,
    nextCursor,
    review,
    page: useCursor ? null : page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
  });
}

async function serializeClips(items: DetectionRow[]) {
  const siteIds = [...new Set(items.map((d) => d.run.siteId))];
  const sites =
    siteIds.length > 0
      ? await prisma.site.findMany({
          where: { id: { in: siteIds } },
          select: { id: true, name: true },
        })
      : [];
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));

  const videoIds = [...new Set(items.map((d) => d.videoId))];
  const videos =
    videoIds.length > 0
      ? await prisma.video.findMany({
          where: { id: { in: videoIds } },
          select: {
            id: true,
            sourceUrl: true,
            sourceSite: true,
            status: true,
            s3VideoKey: true,
            slug: true,
            sites: {
              include: { site: { select: { id: true, name: true, domain: true } } },
            },
          },
        })
      : [];
  const videoById = new Map(videos.map((v) => [v.id, v]));

  return items.map((d) => {
    const video = videoById.get(d.videoId);
    const canPublishToSite = video ? isClipPublishableVideo(video) : false;
    const publishedSites = video?.sites.map((vs) => vs.site) ?? [];
    return {
      id: d.id,
      videoId: d.videoId,
      videoTitle: d.videoTitle,
      label: d.label,
      startSec: d.startSec,
      endSec: d.endSec,
      screenX: d.screenX,
      screenY: d.screenY,
      screenW: d.screenW,
      screenH: d.screenH,
      confidence: d.confidence,
      runId: d.runId,
      siteId: d.run.siteId,
      siteName: siteNameById.get(d.run.siteId) ?? d.run.siteId,
      feedback: d.feedback,
      canPublishToSite,
      videoStatus: video?.status ?? null,
      videoSlug: video?.slug ?? null,
      publishedSites,
    };
  });
}
