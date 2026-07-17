import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";

/** Load approved/manual detections by id for opening in the video editor. */
export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);

  if (ids.length === 0) {
    return NextResponse.json({ clips: [] });
  }

  const detections = await prisma.videoAgentDetection.findMany({
    where: {
      id: { in: ids },
      run: { siteId: auth.siteId },
    },
    orderBy: { createdAt: "asc" },
  });

  // Preserve request order
  const byId = new Map(detections.map((d) => [d.id, d]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

  return NextResponse.json({
    clips: ordered.map((d) => ({
      id: d!.id,
      videoId: d!.videoId,
      videoTitle: d!.videoTitle,
      startSec: d!.startSec,
      endSec: d!.endSec,
      screenX: d!.screenX,
      screenY: d!.screenY,
      screenW: d!.screenW,
      screenH: d!.screenH,
    })),
  });
}
