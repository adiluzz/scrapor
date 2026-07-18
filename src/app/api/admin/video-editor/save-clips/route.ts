import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { ensureDefaultVideoAgent } from "@/lib/video-agent-agent";
import { logger } from "@/lib/logger";

const cropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().min(0.05).max(1),
    h: z.number().min(0.05).max(1),
    aspect: z.enum(["16:9", "9:16", "1:1", "4:5", "free"]).optional(),
  })
  .optional();

const schema = z.object({
  siteId: z.string().min(1),
  title: z.string().max(200).optional(),
  segments: z
    .array(
      z.object({
        videoId: z.string().min(1),
        title: z.string().optional(),
        startSec: z.number().min(0),
        endSec: z.number().positive(),
        crop: cropSchema,
      })
    )
    .min(1)
    .max(40),
});

/**
 * Persist timeline clips as Ad clips (no FFmpeg compose). Review in Pending before they appear under Approved.
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
        userPrompt: d.title?.trim() || "video-editor save clips",
        searchQuery: "editor-clips",
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
      const crop = seg.crop;
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
          screenX: crop?.x ?? null,
          screenY: crop?.y ?? null,
          screenW: crop?.w ?? null,
          screenH: crop?.h ?? null,
        },
      });
      detectionIds.push(det.id);
    }

    return NextResponse.json({
      ok: true,
      runId: run.id,
      detectionIds,
      count: detectionIds.length,
    });
  } catch (err) {
    logger.error({ err }, "video-editor save-clips failed");
    return NextResponse.json({ error: "Failed to save clips" }, { status: 500 });
  }
}
