import { prisma } from "@/lib/db";
import { packSegmentsToDuration } from "@/lib/video-editor-cost";
import { syncPromoAdCompileStatus } from "@/lib/ad-clips-compile";

export type EditorSegment = {
  videoId: string;
  title: string;
  startSec: number;
  endSec: number;
  confidence?: number;
};

/** Pull detections from a video-agent run and pack into target duration. */
export async function segmentsFromVideoAgentRun(
  runId: string,
  targetDurationSec: number
): Promise<EditorSegment[]> {
  const detections = await prisma.videoAgentDetection.findMany({
    where: { runId },
    orderBy: { confidence: "desc" },
  });
  const durationByVideo = new Map(
    (
      await prisma.video.findMany({
        where: { id: { in: [...new Set(detections.map((d) => d.videoId))] } },
        select: { id: true, durationSec: true },
      })
    ).map((v) => [v.id, v.durationSec])
  );
  return packSegmentsToDuration(
    detections.map((d) => ({
      videoId: d.videoId,
      videoTitle: d.videoTitle,
      startSec: d.startSec,
      endSec: d.endSec,
      confidence: d.confidence,
      label: d.label,
      screenX: d.screenX,
      screenY: d.screenY,
      screenW: d.screenW,
      screenH: d.screenH,
      sourceDurationSec: durationByVideo.get(d.videoId) ?? null,
    })),
    targetDurationSec
  );
}

/** Refresh job status from linked video-agent run / promo ad. */
export async function syncVideoEditorJob(jobId: string) {
  const job = await prisma.videoEditorJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  if (job.videoAgentRunId && (job.status === "PENDING" || job.status === "ANALYZING")) {
    const run = await prisma.videoAgentRun.findUnique({ where: { id: job.videoAgentRunId } });
    if (!run) return job;
    if (run.status === "RUNNING" || run.status === "PENDING") {
      return prisma.videoEditorJob.update({
        where: { id: jobId },
        data: { status: "ANALYZING" },
      });
    }
    if (run.status === "ERROR") {
      return prisma.videoEditorJob.update({
        where: { id: jobId },
        data: { status: "ERROR", error: run.error || "Analysis failed" },
      });
    }
    if (run.status === "DONE") {
      const detections = await prisma.videoAgentDetection.findMany({
        where: { runId: job.videoAgentRunId },
        select: { id: true },
      });
      const segments = await segmentsFromVideoAgentRun(job.videoAgentRunId, job.targetDurationSec);
      if (segments.length === 0) {
        const error =
          detections.length === 0
            ? "Analysis finished with no detections — try a more specific prompt describing visible moments"
            : "Detections found but none passed filters (5–10s moving video, no ads/stills) — try a different prompt";
        return prisma.videoEditorJob.update({
          where: { id: jobId },
          data: {
            status: "ERROR",
            error,
            segmentsJson: "[]",
          },
        });
      }
      return prisma.videoEditorJob.update({
        where: { id: jobId },
        data: {
          status: "READY",
          segmentsJson: JSON.stringify(segments),
        },
      });
    }
  }

  if (job.promoAdId && (job.status === "RENDERING" || job.mode === "AUTO_RENDER")) {
    const ad = await prisma.promoAd.findUnique({
      where: { id: job.promoAdId },
      include: {
        iterations: { orderBy: { iterationNumber: "desc" }, take: 1 },
      },
    });
    if (ad?.status === "DONE" && ad.iterations[0]?.s3Key) {
      const compiled = await syncPromoAdCompileStatus(job.promoAdId, job.createdByUserId);
      return prisma.videoEditorJob.update({
        where: { id: jobId },
        data: {
          status: "DONE",
          resultVideoId:
            compiled?.status === "DONE" ? compiled.videoId : job.resultVideoId ?? undefined,
        },
      });
    }
    if (ad?.status === "ERROR") {
      return prisma.videoEditorJob.update({
        where: { id: jobId },
        data: {
          status: "ERROR",
          error: ad.iterations[0]?.error || "Render failed",
        },
      });
    }
  }

  return job;
}
