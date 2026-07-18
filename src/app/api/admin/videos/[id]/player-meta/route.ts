import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { adminThumbUrl, loadStoryboardData } from "@/lib/media";
import { ensureVideoPosterUrl } from "@/lib/video-thumbnail";

/** Poster, storyboard, and heatmap for admin clip tools using VideoPlayer. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const video = await prisma.video.findUnique({
    where: { id },
    include: { heatmap: true },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [poster, storyboard] = await Promise.all([
    ensureVideoPosterUrl(video.id),
    loadStoryboardData(video, { directS3: video.isDeleted }),
  ]);

  let heatmap: number[] = [];
  try {
    const parsed = video.heatmap?.buckets ? JSON.parse(video.heatmap.buckets) : [];
    if (Array.isArray(parsed)) heatmap = parsed.filter((n) => typeof n === "number");
  } catch {
    heatmap = [];
  }

  return NextResponse.json({
    poster,
    storyboard,
    heatmap,
    durationSec: video.durationSec,
  });
}
