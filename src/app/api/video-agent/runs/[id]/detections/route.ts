import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { parseRunTargets } from "@/lib/video-agent-runs";

const createSchema = z.object({
  videoId: z.string().min(1),
  label: z.string().min(1).max(200),
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  screenX: z.number().min(0).max(1).nullable().optional(),
  screenY: z.number().min(0).max(1).nullable().optional(),
  screenW: z.number().min(0).max(1).nullable().optional(),
  screenH: z.number().min(0).max(1).nullable().optional(),
});

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteCtx) {
  const auth = await guardAdmin(request, "POST");
  if (auth instanceof NextResponse) return auth;
  const { id: runId } = await params;

  const run = await prisma.videoAgentRun.findFirst({
    where: { id: runId, siteId: auth.siteId },
  });
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;

  if (d.endSec <= d.startSec) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }
  if (d.endSec - d.startSec < 0.5) {
    return NextResponse.json({ error: "Clip must be at least 0.5 seconds" }, { status: 400 });
  }

  const video = await prisma.video.findFirst({
    where: { id: d.videoId, siteId: auth.siteId },
    select: { id: true, title: true, durationSec: true },
  });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  if (video.durationSec != null && d.endSec > video.durationSec + 1) {
    return NextResponse.json({ error: "End time exceeds video duration" }, { status: 400 });
  }

  const targets = parseRunTargets(run.extractTargets);
  const label = d.label.trim();

  const detection = await prisma.videoAgentDetection.create({
    data: {
      runId,
      videoId: video.id,
      videoTitle: video.title,
      label,
      startSec: d.startSec,
      endSec: d.endSec,
      screenX: d.screenX ?? null,
      screenY: d.screenY ?? null,
      screenW: d.screenW ?? null,
      screenH: d.screenH ?? null,
      confidence: null,
      manual: true,
    },
    include: { feedback: true },
  });

  return NextResponse.json({
    detection,
    suggestedLabels: targets,
  });
}
