import { NextResponse } from "next/server";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { parseUserPrompt } from "@/lib/video-agent/parse-prompt";
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

  if (!userPrompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const model = resolveVideoAgentModel(analysisModel);
  if (!model) {
    return NextResponse.json({ error: "Invalid analysis model" }, { status: 400 });
  }

  const userId = authUserId(auth);
  if (!userId) {
    return NextResponse.json({ error: "Session required" }, { status: 401 });
  }

  try {
    const agent = await prisma.videoAgent.findUnique({
      where: { key: agentKey },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const parsed = await parseUserPrompt(userPrompt);

    const run = await prisma.videoAgentRun.create({
      data: {
        siteId: auth.siteId,
        agentId: agent.id,
        userPrompt,
        searchQuery: parsed.searchQuery,
        extractTargets: JSON.stringify(parsed.extractTargets),
        analysisModel: model.id,
        createdByUserId: userId,
        status: "PENDING",
      },
    });

    await enqueueVideoAgentRun(run.id);

    return NextResponse.json({ runId: run.id, run });
  } catch (err) {
    logger.error({ err }, "video-agent enqueue failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start analysis" },
      { status: 500 }
    );
  }
}
