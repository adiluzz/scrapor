import { prisma } from "@/lib/db";
import { upsertVideoWithMedia } from "@/lib/videos";
import { approveDetectionForAdClips } from "@/lib/ad-clips";
import { ensureDefaultVideoAgent } from "@/lib/video-agent-agent";
import { parseModelParams } from "@/lib/promo-ad/params";
import { copyS3Object, isS3Configured, s3Keys } from "@/lib/storage";
import { redis, PREVIEW_QUEUE_KEY } from "@/lib/redis";
import { logger } from "@/lib/logger";

const COMPILED_SOURCE_PREFIX = "editor-compile://";

export function compiledVideoSourceUrl(promoAdId: string): string {
  return `${COMPILED_SOURCE_PREFIX}${promoAdId}`;
}

function estimateCompiledDurationSec(
  clips: { startSec: number; endSec: number }[],
  maxBodySeconds?: number
): number {
  let body = clips.reduce((s, c) => s + Math.max(0, c.endSec - c.startSec), 0);
  if (maxBodySeconds != null && maxBodySeconds > 0) {
    body = Math.min(body, maxBodySeconds);
  }
  // Intro + outro bookends (~6s total).
  return Math.max(1, body + 6);
}

export type CompiledPublishResult = {
  videoId: string;
  detectionId: string;
  title: string;
};

/**
 * Copy a finished CLIP_COMPOSE render into the library and list it on Ad clips
 * as one full-length compiled video. Idempotent per promoAdId.
 */
export async function publishCompiledPromoAdToAdClips(
  promoAdId: string,
  userId?: string | null
): Promise<CompiledPublishResult | null> {
  const ad = await prisma.promoAd.findUnique({
    where: { id: promoAdId },
    include: {
      clips: { include: { detection: true }, orderBy: { sortOrder: "asc" } },
      iterations: { orderBy: { iterationNumber: "desc" }, take: 1 },
    },
  });
  if (!ad || ad.status !== "DONE") return null;

  const iteration = ad.iterations[0];
  if (!iteration?.s3Key) return null;

  const sourceUrl = compiledVideoSourceUrl(promoAdId);
  const title = (ad.title || "Compiled edit").slice(0, 200);
  const params = parseModelParams(ad.modelParams);
  const durationSec = estimateCompiledDurationSec(
    ad.clips.map((c) => c.detection),
    params.maxBodySeconds
  );

  let video = await prisma.video.findUnique({ where: { sourceUrl } });

  if (!video) {
    video = await upsertVideoWithMedia({
      siteId: ad.siteId,
      publishSiteIds: [ad.siteId],
      sourceUrl,
      title,
      description: "Compiled from video editor timeline",
      durationSec,
      sourceSite: "VideoEditor",
      status: isS3Configured() ? "READY" : "PENDING",
      tags: ["compiled", "edited"],
    });

    if (isS3Configured()) {
      const destKey = s3Keys.video(ad.siteId, video.id);
      await copyS3Object(iteration.s3Key, destKey);
      video = await prisma.video.update({
        where: { id: video.id },
        data: { s3VideoKey: destKey, status: "READY", durationSec },
      });
    }

    try {
      await redis.rpush(PREVIEW_QUEUE_KEY, video.id);
    } catch (err) {
      logger.warn({ err, videoId: video.id }, "compiled video preview queue failed");
    }
  }

  const existingDet = await prisma.videoAgentDetection.findFirst({
    where: { videoId: video.id, label: "compiled" },
    orderBy: { createdAt: "desc" },
  });
  if (existingDet) {
    await approveDetectionForAdClips(existingDet.id, userId);
    return { videoId: video.id, detectionId: existingDet.id, title };
  }

  const agent = await ensureDefaultVideoAgent();
  const run = await prisma.videoAgentRun.create({
    data: {
      siteId: ad.siteId,
      agentId: agent.id,
      userPrompt: title,
      searchQuery: "editor-compile",
      extractTargets: JSON.stringify(["compiled"]),
      selectedVideoIds: JSON.stringify([video.id]),
      analysisModel: "manual",
      manualOnly: true,
      status: "DONE",
      createdByUserId: userId ?? null,
    },
  });

  const det = await prisma.videoAgentDetection.create({
    data: {
      runId: run.id,
      videoId: video.id,
      videoTitle: title,
      label: "compiled",
      startSec: 0,
      endSec: durationSec,
      confidence: 1,
      manual: true,
    },
  });

  await approveDetectionForAdClips(det.id, userId);

  logger.info(
    { promoAdId, videoId: video.id, detectionId: det.id },
    "published compiled editor video to ad clips"
  );

  return { videoId: video.id, detectionId: det.id, title };
}

export type CompileStatus =
  | { status: "PENDING" | "GENERATING" | "DRAFT" }
  | { status: "ERROR"; error: string | null }
  | ({ status: "DONE" } & CompiledPublishResult);

/** Poll promo-ad compose; publish to Ad clips when the render finishes. */
export async function syncPromoAdCompileStatus(
  promoAdId: string,
  userId?: string | null
): Promise<CompileStatus | null> {
  const ad = await prisma.promoAd.findUnique({
    where: { id: promoAdId },
    include: {
      iterations: { orderBy: { iterationNumber: "desc" }, take: 1 },
    },
  });
  if (!ad) return null;

  if (ad.status === "ERROR") {
    return { status: "ERROR", error: ad.iterations[0]?.error ?? "Render failed" };
  }

  if (ad.status === "DONE" && ad.iterations[0]?.s3Key) {
    const published = await publishCompiledPromoAdToAdClips(promoAdId, userId);
    if (!published) return { status: "ERROR", error: "Render finished but publish failed" };
    return { status: "DONE", ...published };
  }

  const iterStatus = ad.iterations[0]?.status;
  if (iterStatus === "GENERATING" || ad.status === "GENERATING") {
    return { status: "GENERATING" };
  }
  if (iterStatus === "PENDING") return { status: "PENDING" };
  return { status: "DRAFT" };
}
