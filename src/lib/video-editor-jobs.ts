import { prisma } from "@/lib/db";
import { packSegmentsToDuration } from "@/lib/video-editor-cost";

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
  return packSegmentsToDuration(
    detections.map((d) => ({
      videoId: d.videoId,
      videoTitle: d.videoTitle,
      startSec: d.startSec,
      endSec: d.endSec,
      confidence: d.confidence,
      label: d.label,
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
      const segments = await segmentsFromVideoAgentRun(job.videoAgentRunId, job.targetDurationSec);
      if (segments.length === 0) {
        return prisma.videoEditorJob.update({
          where: { id: jobId },
          data: {
            status: "ERROR",
            error: "No highlight segments found — try a different prompt or model",
            segmentsJson: "[]",
          },
        });
      }
      return prisma.videoEditorJob.update({
        where: { id: jobId },
        data: {
          status: job.mode === "AUTO_RENDER" ? "RENDERING" : "READY",
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
      return prisma.videoEditorJob.update({
        where: { id: jobId },
        data: { status: "DONE" },
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
