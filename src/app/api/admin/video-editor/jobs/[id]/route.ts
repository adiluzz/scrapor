import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { syncVideoEditorJob } from "@/lib/video-editor-jobs";
import { enqueuePromoAdIteration } from "@/lib/promo-ad-queue";
import { stringifyModelParams, defaultModelParams } from "@/lib/promo-ad/params";
import { approveDetectionsForAdClips } from "@/lib/ad-clips";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guardAdmin(_request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let job = await prisma.videoEditorJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  job = (await syncVideoEditorJob(id)) || job;

  if (job.mode === "AUTO_RENDER" && job.status === "RENDERING" && !job.promoAdId && job.segmentsJson) {
    try {
      const segments = JSON.parse(job.segmentsJson) as Array<{
        videoId: string;
        title: string;
        startSec: number;
        endSec: number;
      }>;
      if (segments.length) {
        const agent = await prisma.videoAgent.findFirst({ orderBy: { createdAt: "asc" } });
        const run =
          job.videoAgentRunId
            ? await prisma.videoAgentRun.findUnique({ where: { id: job.videoAgentRunId } })
            : null;

        let runId = run?.id;
        if (!runId && agent) {
          const synthetic = await prisma.videoAgentRun.create({
            data: {
              siteId: job.siteId,
              agentId: agent.id,
              userPrompt: "video-editor auto-render",
              searchQuery: "editor",
              extractTargets: JSON.stringify(["highlight"]),
              selectedVideoIds: job.sourceVideoIds,
              analysisModel: "manual",
              manualOnly: true,
              status: "DONE",
              createdByUserId: job.createdByUserId,
            },
          });
          runId = synthetic.id;
        }

        const detectionIds: string[] = [];
        if (runId) {
          for (const seg of segments) {
            const det = await prisma.videoAgentDetection.create({
              data: {
                runId,
                videoId: seg.videoId,
                videoTitle: seg.title,
                label: "highlight",
                startSec: seg.startSec,
                endSec: seg.endSec,
                confidence: 1,
                manual: true,
              },
            });
            detectionIds.push(det.id);
          }
          await approveDetectionsForAdClips(detectionIds, job.createdByUserId);
        }

        const modelParams = stringifyModelParams(
          defaultModelParams("CLIP_COMPOSE", {
            maxBodySeconds: job.targetDurationSec,
            logoPosition: "bottom-right",
            logoOpacity: 0.85,
            crossfadeSec: 0.4,
          })
        );

        const ad = await prisma.promoAd.create({
          data: {
            siteId: job.siteId,
            title: job.title || "Video editor auto-render",
            status: "DRAFT",
            generationMode: "CLIP_COMPOSE",
            modelParams,
            createdByUserId: job.createdByUserId,
            clips: {
              create: detectionIds.map((detectionId, i) => ({
                detectionId,
                sortOrder: i,
              })),
            },
          },
        });

        const iteration = await prisma.promoAdIteration.create({
          data: {
            promoAdId: ad.id,
            iterationNumber: 1,
            modelParams,
            status: "PENDING",
            estimatedCostUsd: 0,
          },
        });

        await prisma.promoAd.update({
          where: { id: ad.id },
          data: { status: "GENERATING" },
        });

        job = await prisma.videoEditorJob.update({
          where: { id: job.id },
          data: { promoAdId: ad.id, videoAgentRunId: runId || job.videoAgentRunId },
        });

        await enqueuePromoAdIteration(iteration.id);
      }
    } catch (err) {
      job = await prisma.videoEditorJob.update({
        where: { id: job.id },
        data: {
          status: "ERROR",
          error: err instanceof Error ? err.message : "Failed to start auto-render",
        },
      });
    }
  }

  const segments = job.segmentsJson ? JSON.parse(job.segmentsJson) : [];
  return NextResponse.json({ job, segments });
}
