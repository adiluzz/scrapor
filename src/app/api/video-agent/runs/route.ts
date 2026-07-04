import { NextResponse } from "next/server";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { parseUserPrompt } from "@/lib/video-agent/parse-prompt";
import { ensureDefaultVideoAgent } from "@/lib/video-agent-agent";
import {
  DEFAULT_VIDEO_AGENT_MODEL,
  resolveVideoAgentModel,
} from "@/lib/video-agent-models";
import { enqueueVideoAgentRun } from "@/lib/video-agent-queue";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const runs = await prisma.videoAgentRun.findMany({
    where: { siteId: auth.siteId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      agent: { select: { name: true, key: true } },
      _count: { select: { detections: true } },
    },
  });

  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const agentKey = typeof body.agentKey === "string" ? body.agentKey : "content-detector";
  const analysisModel =
    typeof body.analysisModel === "string" ? body.analysisModel.trim() : DEFAULT_VIDEO_AGENT_MODEL;
  const videoIds = Array.isArray(body.videoIds)
    ? body.videoIds.filter((id: unknown) => typeof id === "string" && id.trim()).map((id: string) => id.trim())
    : [];
  const searchQueryFromBody = typeof body.searchQuery === "string" ? body.searchQuery.trim() : "";
  const extractTargetsFromBody = Array.isArray(body.extractTargets)
    ? body.extractTargets.filter((t: unknown) => typeof t === "string" && t.trim())
    : null;
  const manualOnly = body.manualOnly === true;

  if (!userPrompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (videoIds.length === 0) {
    return NextResponse.json({ error: "Select at least one video to analyze" }, { status: 400 });
  }

  let resolvedModel = resolveVideoAgentModel(analysisModel);
  if (!manualOnly) {
    if (!resolvedModel) {
      return NextResponse.json({ error: "Invalid analysis model" }, { status: 400 });
    }
  }

  const userId = authUserId(auth);
  if (!userId) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }

  try {
    const validVideos = await prisma.video.findMany({
      where: {
        siteId: auth.siteId,
        id: { in: videoIds },
        isDeleted: false,
        status: "READY",
      },
      select: { id: true },
    });
    if (validVideos.length === 0) {
      return NextResponse.json({ error: "No valid videos selected" }, { status: 400 });
    }
    const validIds = validVideos.map((v) => v.id);

    let searchQuery = searchQueryFromBody;
    let extractTargets = extractTargetsFromBody;
    if (!searchQuery || !extractTargets?.length) {
      const parseModel = manualOnly ? "nova-2-lite" : analysisModel;
      const parsed = await parseUserPrompt(userPrompt, parseModel);
      searchQuery = searchQuery || parsed.searchQuery;
      extractTargets = extractTargets?.length ? extractTargets : parsed.extractTargets;
    }

    const agent =
      agentKey === "content-detector"
        ? await ensureDefaultVideoAgent()
        : await prisma.videoAgent.findUnique({ where: { key: agentKey } });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const run = await prisma.videoAgentRun.create({
      data: {
        siteId: auth.siteId,
        agentId: agent.id,
        userPrompt,
        searchQuery,
        extractTargets: JSON.stringify(extractTargets),
        selectedVideoIds: JSON.stringify(validIds),
        analysisModel: manualOnly ? "manual" : resolvedModel!.id,
        manualOnly,
        createdByUserId: userId,
        status: manualOnly ? "DONE" : "PENDING",
      },
    });

    if (!manualOnly) {
      await enqueueVideoAgentRun(run.id);
    }

    return NextResponse.json({ runId: run.id, run });
  } catch (err) {
    logger.error({ err }, "video-agent enqueue failed");
    const message = err instanceof Error ? err.message : "Failed to start analysis";
    const hint = message.includes("VideoAgent")
      ? " Database migrations may be pending — run: docker compose run --rm migrate"
      : "";
    return NextResponse.json({ error: message + hint }, { status: 500 });
  }
}
