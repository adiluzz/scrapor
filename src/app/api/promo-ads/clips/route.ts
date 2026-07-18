import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { adClipsSiteWhere } from "@/lib/ad-clips";
import { isClipPublishableVideo } from "@/lib/ad-clips-publish";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 48;

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const label = url.searchParams.get("label")?.trim();
  const siteId = url.searchParams.get("siteId");
  const review = url.searchParams.get("review") === "pending" ? "pending" : "approved";

  const reviewWhere =
    review === "pending"
      ? { feedback: null }
      : { feedback: { approved: true } };

  const detections = await prisma.videoAgentDetection.findMany({
    where: {
      ...adClipsSiteWhere(auth, siteId),
      ...reviewWhere,
      ...(label ? { label: { contains: label, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      feedback: { select: { approved: true, createdAt: true } },
      run: {
        select: {
          id: true,
          userPrompt: true,
          siteId: true,
        },
      },
    },
  });

  const hasMore = detections.length > PAGE_SIZE;
  const items = hasMore ? detections.slice(0, PAGE_SIZE) : detections;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

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

  return NextResponse.json({
    clips: items.map((d) => {
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
    }),
    nextCursor,
    review,
  });
}
