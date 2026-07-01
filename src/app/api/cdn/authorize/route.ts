import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyStreamToken } from "@/lib/cdn";
import { presignGet, s3Keys } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * nginx auth_request target. nginx has already validated the secure_link
 * (expiry + IP + integrity). Here we enforce app-level policy and return a
 * fresh presigned S3 URL via the `X-S3-Url` header, which nginx proxies to.
 *
 * Two modes:
 *   - stream:  /v/{videoId}/video.mp4  → requires a valid ad-claim token (`t`)
 *   - asset:   /a/{videoId}/{file}     → thumbnail/preview/storyboard (no ad gate)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId") || "";
  const file = searchParams.get("file") || ""; // asset mode
  const token = searchParams.get("t") || ""; // stream mode

  if (!videoId) return new NextResponse("bad request", { status: 400 });

  let adminPreview = false;
  if (!file) {
    const claim = verifyStreamToken(token);
    adminPreview = Boolean(claim?.adminPreview);
  }

  // Soft-delete revokes public CDN access; admin-preview stream tokens bypass this.
  const video = await prisma.video.findFirst({
    where: { id: videoId, ...(adminPreview ? {} : { isDeleted: false }) },
  });
  if (!video) return new NextResponse("gone", { status: 410 });

  let key: string;
  if (file) {
    switch (file) {
      case "thumbnail.jpg": key = s3Keys.thumb(video.siteId, video.id); break;
      case "preview.mp4": key = s3Keys.preview(video.siteId, video.id); break;
      case "storyboard.jpg": key = s3Keys.storyboard(video.siteId, video.id); break;
      case "storyboard.vtt": key = s3Keys.storyboardVtt(video.siteId, video.id); break;
      default: return new NextResponse("bad file", { status: 400 });
    }
  } else {
    // Stream mode: validate the ad-claim token.
    const claim = verifyStreamToken(token);
    if (!claim || claim.videoId !== video.id || claim.siteId !== video.siteId) {
      logger.warn({ videoId }, "cdn authorize: invalid stream token");
      return new NextResponse("forbidden", { status: 403 });
    }
    key = s3Keys.video(video.siteId, video.id);
  }

  const presigned = await presignGet(key, 60);
  const res = new NextResponse(null, { status: 200 });
  res.headers.set("X-S3-Url", presigned);
  // nginx must send this exact Host to S3 — a presigned GET signs the Host
  // header, so proxying with a different/empty Host yields SignatureDoesNotMatch.
  res.headers.set("X-S3-Host", new URL(presigned).host);
  return res;
}
