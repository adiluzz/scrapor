import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { logger } from "@/lib/logger";

/** Remove this pornstar from a video (unlink only — does not delete the video). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id: pornstarId } = await params;

  const star = await prisma.pornstar.findFirst({
    where: { id: pornstarId, siteId: auth.siteId },
    select: { id: true },
  });
  if (!star) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId")?.trim();
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const video = await prisma.video.findFirst({
    where: { id: videoId, siteId: auth.siteId },
    select: { id: true },
  });
  if (!video) return NextResponse.json({ error: "Video not found" }, { status: 404 });

  const result = await prisma.videoPornstar.deleteMany({
    where: { pornstarId, videoId },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Pornstar is not linked to this video" }, { status: 404 });
  }

  logger.info({ pornstarId, videoId }, "admin unlinked pornstar from video");
  return NextResponse.json({ ok: true });
}
