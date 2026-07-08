import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { redis, REDOWNLOAD_QUEUE_KEY } from "@/lib/redis";
import { logger } from "@/lib/logger";

/** Queue re-download of a video from its source URL (worker replaces stored media). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guardAdmin(_request, "POST");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const video = await prisma.video.findFirst({
    where: { id, siteId: auth.siteId },
    select: { id: true, slug: true, sourceUrl: true, status: true },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!video.sourceUrl || video.sourceUrl.startsWith("upload://")) {
    return NextResponse.json(
      { error: "Video has no external source URL — cannot re-download" },
      { status: 400 }
    );
  }
  if (video.status === "PROCESSING") {
    return NextResponse.json({ error: "Video is already processing" }, { status: 409 });
  }

  try {
    await prisma.video.update({ where: { id }, data: { status: "PROCESSING" } });
    await redis.rpush(REDOWNLOAD_QUEUE_KEY, video.id);
    logger.info({ videoId: video.id, slug: video.slug }, "queued video redownload");
    return NextResponse.json({ ok: true, queued: true, videoId: video.id, slug: video.slug });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Queue failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
