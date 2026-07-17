import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { enqueuePromoAdIteration } from "@/lib/promo-ad-queue";
import { defaultModelParams, stringifyModelParams } from "@/lib/promo-ad/params";
import { ensureDefaultVideoAgent } from "@/lib/video-agent-agent";
import { logger } from "@/lib/logger";

const segmentSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().optional(),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
});

const schema = z.object({
  siteId: z.string().min(1),
  title: z.string().max(200).optional(),
  jobId: z.string().optional(),
  segments: z.array(segmentSchema).min(1).max(40),
  logoPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
  maxBodySeconds: z.number().int().min(5).max(300).optional(),
});

/**
 * Server FFmpeg compose from explicit segments (OpenReel fallback / AI auto-render).
 * Creates manual detections + CLIP_COMPOSE promo ad iteration.
 */
export async function POST(request: Request) {
  const auth = await guardAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const userId = authUserId(auth);

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }
  const d = parsed.data;

  for (const seg of d.segments) {
    if (seg.endSec <= seg.startSec) {
      return NextResponse.json({ error: "Each segment needs endSec > startSec" }, { status: 400 });
    }
  }

  try {
    const agent = await ensureDefaultVideoAgent();
    const run = await prisma.videoAgentRun.create({
      data: {
        siteId: d.siteId,
        agentId: agent.id,
        userPrompt: "video-editor server render",
        searchQuery: "editor-render",
        extractTargets: JSON.stringify(["highlight"]),
        selectedVideoIds: JSON.stringify([...new Set(d.segments.map((s) => s.videoId))]),
        analysisModel: "manual",
        manualOnly: true,
        status: "DONE",
        createdByUserId: userId,
      },
    });

    const detectionIds: string[] = [];
    for (const seg of d.segments) {
      const video = await prisma.video.findUnique({
        where: { id: seg.videoId },
        select: { title: true },
      });
      const det = await prisma.videoAgentDetection.create({
        data: {
          runId: run.id,
          videoId: seg.videoId,
          videoTitle: seg.title || video?.title || seg.videoId,
          label: "highlight",
          startSec: seg.startSec,
          endSec: seg.endSec,
          confidence: 1,
          manual: true,
        },
      });
      detectionIds.push(det.id);
    }

    const bodySec =
      d.maxBodySeconds ??
      Math.ceil(d.segments.reduce((s, x) => s + (x.endSec - x.startSec), 0));

    const modelParams = stringifyModelParams(
      defaultModelParams("CLIP_COMPOSE", {
        maxBodySeconds: Math.min(300, Math.max(5, bodySec)),
        logoPosition: d.logoPosition || "bottom-right",
        logoOpacity: 0.85,
        crossfadeSec: 0.4,
        showTagline: true,
      })
    );

    const ad = await prisma.promoAd.create({
      data: {
        siteId: d.siteId,
        title: d.title?.trim() || "Video editor render",
        status: "GENERATING",
        generationMode: "CLIP_COMPOSE",
        modelParams,
        createdByUserId: userId,
        clips: {
          create: detectionIds.map((detectionId, i) => ({ detectionId, sortOrder: i })),
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

    if (d.jobId) {
      await prisma.videoEditorJob.updateMany({
        where: { id: d.jobId, siteId: d.siteId },
        data: { promoAdId: ad.id, status: "RENDERING", videoAgentRunId: run.id },
      });
    }

    await enqueuePromoAdIteration(iteration.id);

    return NextResponse.json({
      ok: true,
      promoAdId: ad.id,
      iterationId: iteration.id,
      runId: run.id,
    });
  } catch (err) {
    logger.error({ err }, "video-editor auto-render failed");
    return NextResponse.json({ error: "Failed to start server render" }, { status: 500 });
  }
}
