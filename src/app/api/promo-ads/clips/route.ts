import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 48;

export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const label = url.searchParams.get("label")?.trim();

  const detections = await prisma.videoAgentDetection.findMany({
    where: {
      feedback: { approved: true },
      run: { siteId: auth.siteId },
      ...(label ? { label: { contains: label, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      feedback: { select: { approved: true, createdAt: true } },
      run: { select: { id: true, userPrompt: true } },
    },
  });

  const hasMore = detections.length > PAGE_SIZE;
  const items = hasMore ? detections.slice(0, PAGE_SIZE) : detections;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return NextResponse.json({
    clips: items.map((d) => ({
      id: d.id,
      videoId: d.videoId,
      videoTitle: d.videoTitle,
      label: d.label,
      startSec: d.startSec,
      endSec: d.endSec,
      screenX: d.screenX,
      screenY: d.screenY,
      screenW: d.screenW,
      screenH: d.screenH,
      confidence: d.confidence,
      runId: d.runId,
      feedback: d.feedback,
    })),
    nextCursor,
  });
}
