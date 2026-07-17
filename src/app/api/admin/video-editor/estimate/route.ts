import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { estimateVideoEditorCost } from "@/lib/video-editor-cost";

const schema = z.object({
  videoIds: z.array(z.string().min(1)).min(1).max(20),
  targetDurationSec: z.number().int().min(5).max(300).optional(),
  analysisModelId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const auth = await guardAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const videos = await prisma.video.findMany({
    where: { id: { in: parsed.data.videoIds }, isDeleted: false },
    select: { id: true, durationSec: true },
  });
  const sourceDurationSec = videos.reduce((sum, v) => sum + (v.durationSec || 0), 0);
  if (sourceDurationSec <= 0) {
    return NextResponse.json(
      { error: "Selected videos need a known duration" },
      { status: 400 }
    );
  }

  const estimate = estimateVideoEditorCost({
    sourceDurationSec,
    targetDurationSec: parsed.data.targetDurationSec,
    analysisModelId: parsed.data.analysisModelId,
  });

  return NextResponse.json({ estimate, videoCount: videos.length });
}
