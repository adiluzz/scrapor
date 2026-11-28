import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { logger } from "@/lib/logger";
import { linkPornstarToVideos } from "@/lib/videos";

const assignSchema = z.object({
  videoIds: z.array(z.string().min(1)).min(1).max(500),
});

/** Link this existing pornstar to videos. Does not create another profile. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id: pornstarId } = await params;

  const star = await prisma.pornstar.findUnique({
    where: { id: pornstarId },
    select: { id: true, name: true, slug: true },
  });
  if (!star) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = assignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await linkPornstarToVideos(star.id, parsed.data.videoIds);
  logger.info({ pornstarId: star.id, ...result }, "admin assigned pornstar to videos");
  return NextResponse.json({ ok: true, ...result });
}

/** Remove this pornstar from a video (unlink only — does not delete the video). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { id: pornstarId } = await params;

  const star = await prisma.pornstar.findUnique({
    where: { id: pornstarId },
    select: { id: true },
  });
  if (!star) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const videoId = url.searchParams.get("videoId")?.trim();
  if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });

  const video = await prisma.video.findUnique({
    where: { id: videoId },
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
