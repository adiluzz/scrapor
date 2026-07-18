import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { ensureDefaultVideoAgent } from "@/lib/video-agent-agent";
import { enqueueVideoAgentRun } from "@/lib/video-agent-queue";
import { resolveVideoAgentModel, DEFAULT_VIDEO_AGENT_MODEL } from "@/lib/video-agent-models";
import { estimateVideoEditorCost } from "@/lib/video-editor-cost";
import { resolveEditorExtractTargets } from "@/lib/video-editor-analyze";
import { buildEditorAnalysisPrompt } from "@/lib/video-editor-segment-filter";
import { logger } from "@/lib/logger";

const schema = z.object({
  siteId: z.string().min(1),
  videoIds: z.array(z.string().min(1)).min(1).max(10),
  title: z.string().max(200).optional(),
  targetDurationSec: z.number().int().min(5).max(300).optional(),
  analysisModelId: z.string().min(1).optional(),
  mode: z.enum(["ANALYZE_OPEN", "AUTO_RENDER"]).optional(),
  prompt: z.string().max(2000).optional(),
});

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
  const modelId = d.analysisModelId || DEFAULT_VIDEO_AGENT_MODEL;
  const model = resolveVideoAgentModel(modelId);
  if (!model) {
    return NextResponse.json({ error: "Invalid or unavailable analysis model" }, { status: 400 });
  }

  const site = await prisma.site.findUnique({ where: { id: d.siteId }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const videos = await prisma.video.findMany({
    where: {
      id: { in: d.videoIds },
      isDeleted: false,
      OR: [{ siteId: d.siteId }, { sites: { some: { siteId: d.siteId } } }],
    },
    select: { id: true, title: true, durationSec: true },
  });
  if (videos.length === 0) {
    return NextResponse.json({ error: "No matching videos on this site" }, { status: 404 });
  }

  const sourceDurationSec = videos.reduce((s, v) => s + (v.durationSec || 0), 0);
  const targetDurationSec = d.targetDurationSec ?? 30;
  const estimate = estimateVideoEditorCost({
    sourceDurationSec: Math.max(sourceDurationSec, 60),
    targetDurationSec,
    analysisModelId: model.id,
  });

  const agent = await ensureDefaultVideoAgent();
  const userPrompt = buildEditorAnalysisPrompt(targetDurationSec, d.prompt);

  const extractTargets = await resolveEditorExtractTargets(userPrompt, model.id);

  try {
    const run = await prisma.videoAgentRun.create({
      data: {
        siteId: d.siteId,
        agentId: agent.id,
        userPrompt,
        searchQuery: videos.map((v) => v.title).join(" ").slice(0, 200) || "highlights",
        extractTargets: JSON.stringify(extractTargets),
        selectedVideoIds: JSON.stringify(videos.map((v) => v.id)),
        analysisModel: model.id,
        manualOnly: false,
        createdByUserId: userId,
        status: "PENDING",
      },
    });

    const job = await prisma.videoEditorJob.create({
      data: {
        siteId: d.siteId,
        sourceVideoIds: JSON.stringify(videos.map((v) => v.id)),
        title: d.title?.trim() || `Highlight · ${videos[0].title}`.slice(0, 200),
        mode: d.mode === "ANALYZE_OPEN" ? "ANALYZE_OPEN" : "AUTO_RENDER",
        status: "ANALYZING",
        analysisModel: model.id,
        targetDurationSec,
        videoAgentRunId: run.id,
        estimatedCostUsd: estimate.totalUsd,
        createdByUserId: userId,
      },
    });

    await enqueueVideoAgentRun(run.id);

    return NextResponse.json({
      ok: true,
      job,
      runId: run.id,
      estimate,
    });
  } catch (err) {
    logger.error({ err }, "video-editor analyze failed");
    return NextResponse.json({ error: "Failed to start analysis" }, { status: 500 });
  }
}
