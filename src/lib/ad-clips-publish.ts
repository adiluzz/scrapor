import { prisma } from "@/lib/db";
import { redis, PREVIEW_QUEUE_KEY } from "@/lib/redis";
import { logger } from "@/lib/logger";

/** Editor exports that can be published as standalone videos (not source-video segments). */
export function isClipPublishableVideo(video: {
  sourceUrl: string | null;
  sourceSite: string | null;
}): boolean {
  const url = video.sourceUrl || "";
  return (
    url.startsWith("editor-compile://") ||
    url.startsWith("editor://") ||
    video.sourceSite === "VideoEditor"
  );
}

export async function publishClipVideoToSites(
  videoId: string,
  siteIds: string[]
): Promise<Array<{ id: string; name: string; domain: string }>> {
  const uniqueSiteIds = [...new Set(siteIds.map((s) => s.trim()).filter(Boolean))];
  if (uniqueSiteIds.length === 0) {
    throw new Error("Select at least one site");
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      sourceUrl: true,
      sourceSite: true,
      s3VideoKey: true,
      isDeleted: true,
    },
  });
  if (!video) throw new Error("Video not found");
  if (!isClipPublishableVideo(video)) {
    throw new Error("Only compiled or editor-uploaded videos can be published from Ad clips");
  }
  if (!video.s3VideoKey) {
    throw new Error("Video file is not ready yet — wait for processing to finish");
  }

  const sites = await prisma.site.findMany({
    where: { id: { in: uniqueSiteIds } },
    select: { id: true, name: true, domain: true },
  });
  if (sites.length !== uniqueSiteIds.length) {
    throw new Error("One or more sites not found");
  }

  await prisma.videoSite.createMany({
    data: uniqueSiteIds.map((siteId) => ({ videoId, siteId })),
    skipDuplicates: true,
  });

  await prisma.video.update({
    where: { id: videoId },
    data: { status: "READY", isDeleted: false },
  });

  try {
    await redis.rpush(PREVIEW_QUEUE_KEY, videoId);
  } catch (err) {
    logger.warn({ err, videoId }, "clip publish preview queue failed");
  }

  return sites;
}

export async function unpublishClipVideoFromSite(
  videoId: string,
  siteId: string
): Promise<Array<{ id: string; name: string; domain: string }>> {
  await prisma.videoSite.deleteMany({ where: { videoId, siteId } });

  const remaining = await prisma.videoSite.findMany({
    where: { videoId },
    include: { site: { select: { id: true, name: true, domain: true } } },
  });

  if (remaining.length === 0) {
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "PENDING" },
    });
  }

  return remaining.map((m) => m.site);
}
