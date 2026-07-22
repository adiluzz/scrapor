import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { mintStreamUrl } from "@/lib/cdn";
import { isS3Configured } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * Grant a signed CDN stream URL for admin preview of any video on the site,
 * including soft-deleted or non-READY rows. Skips ads entirely.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAdmin(request);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  // Platform-wide: admin may preview any video regardless of storage site.
  const video = await prisma.video.findUnique({ where: { id } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "0.0.0.0";

  const grant = mintStreamUrl({
    videoId: video.id,
    siteId: video.siteId,
    clientIp: ip,
    adSessionId: "admin-preview",
    adminPreview: true,
    s3HlsMasterKey: video.s3HlsMasterKey,
  });

  logger.info({ videoId: video.id, isDeleted: video.isDeleted, format: grant.mimeType }, "admin preview stream granted");

  const fallback = !isS3Configured() ? { url: `/api/video/${video.id}`, mimeType: "video/mp4" as const } : null;
  return NextResponse.json(fallback || grant);
}