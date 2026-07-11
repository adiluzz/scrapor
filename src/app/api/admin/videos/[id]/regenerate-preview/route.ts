import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { redis, PREVIEW_QUEUE_KEY } from "@/lib/redis";
import { logger } from "@/lib/logger";

/** Queue hover-preview + storyboard regeneration for an existing video (worker). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guardAdmin(_request, "POST");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const video = await prisma.video.findUnique({
    where: { id },
    select: { id: true, slug: true, s3VideoKey: true, s3PreviewKey: true, previewVersion: true },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!video.s3VideoKey) {
    return NextResponse.json(
      { error: "Video has no stored source file — cannot regenerate preview" },
      { status: 400 }
    );
  }

  try {
    await redis.rpush(PREVIEW_QUEUE_KEY, video.id);
    logger.info({ videoId: video.id, slug: video.slug }, "queued preview regeneration");
    return NextResponse.json({
      ok: true,
      queued: true,
      videoId: video.id,
      slug: video.slug,
      currentPreviewVersion: video.previewVersion,
      targetPreviewVersion: 2,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Queue failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
