import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import {
  isClipPublishableVideo,
  publishClipVideoToSites,
  unpublishClipVideoFromSite,
} from "@/lib/ad-clips-publish";

const postSchema = z.object({
  siteIds: z.array(z.string().min(1)).min(1).max(20),
});

/** Publish a compiled / editor-uploaded Ad clip video to one or more public sites. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ detectionId: string }> }
) {
  const auth = await guardAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { detectionId } = await params;

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const detection = await prisma.videoAgentDetection.findUnique({
    where: { id: detectionId },
    include: {
      run: { select: { siteId: true } },
    },
  });
  if (!detection) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  const video = await prisma.video.findUnique({
    where: { id: detection.videoId },
    select: { id: true, sourceUrl: true, sourceSite: true, s3VideoKey: true, status: true },
  });
  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  if (!isClipPublishableVideo(video)) {
    return NextResponse.json(
      {
        error:
          "This clip is a segment from a library video — only compiled exports can be published as new videos",
      },
      { status: 400 }
    );
  }

  try {
    const sites = await publishClipVideoToSites(video.id, parsed.data.siteIds);
    const membership = await prisma.videoSite.findMany({
      where: { videoId: video.id },
      include: { site: { select: { id: true, name: true, domain: true } } },
    });
    const updated = await prisma.video.findUnique({
      where: { id: video.id },
      select: { status: true },
    });
    return NextResponse.json({
      ok: true,
      videoId: video.id,
      status: updated?.status,
      publishedSites: membership.map((m) => m.site),
      sites,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Remove a compiled clip from a public site. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ detectionId: string }> }
) {
  const auth = await guardAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const { detectionId } = await params;

  const siteId = new URL(request.url).searchParams.get("siteId")?.trim();
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const detection = await prisma.videoAgentDetection.findUnique({
    where: { id: detectionId },
    select: { videoId: true },
  });
  if (!detection) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  const video = await prisma.video.findUnique({
    where: { id: detection.videoId },
    select: { id: true, sourceUrl: true, sourceSite: true },
  });
  if (!video || !isClipPublishableVideo(video)) {
    return NextResponse.json({ error: "This clip cannot be unpublished here" }, { status: 400 });
  }

  const sites = await unpublishClipVideoFromSite(video.id, siteId);
  const updated = await prisma.video.findUnique({
    where: { id: video.id },
    select: { status: true },
  });

  return NextResponse.json({
    ok: true,
    videoId: video.id,
    status: updated?.status,
    publishedSites: sites,
  });
}
