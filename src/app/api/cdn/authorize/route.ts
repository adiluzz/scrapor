import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyStreamToken } from "@/lib/cdn";
import {
  CDN_PRESIGN_SECONDS,
  getCachedPresign,
  getCachedVideoMeta,
  setCachedPresign,
  setCachedVideoMeta,
  type CdnVideoMeta,
} from "@/lib/cdn-cache";
import { presignGet, s3Keys } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * nginx auth_request target. nginx has already validated the secure_link
 * (expiry + integrity; streams also bind client IP). Here we enforce app-level
 * policy and return a fresh presigned S3 URL via the `X-S3-Url` header, which
 * nginx proxies to.
 *
 * Two modes:
 *   - stream:  /v/{videoId}/video.mp4  → requires a valid ad-claim token (`t`)
 *   - asset:   /a/{videoId}/{file}     → thumbnail/preview/storyboard (no ad gate)
 *
 * Redis caches video metadata (~5m) and S3 presigns (~50s) so parallel Range
 * requests do not each hit Postgres + STS signing. Fail-open on Redis errors.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId") || "";
  const file = searchParams.get("file") || ""; // asset mode
  const token = searchParams.get("t") || ""; // stream mode

  if (!videoId) return new NextResponse("bad request", { status: 400 });

  let adminPreview = false;
  let streamClaim: ReturnType<typeof verifyStreamToken> = null;
  if (!file) {
    streamClaim = verifyStreamToken(token);
    if (!streamClaim) {
      logger.warn({ videoId }, "cdn authorize: invalid stream token");
      return new NextResponse("forbidden", { status: 403 });
    }
    adminPreview = Boolean(streamClaim.adminPreview);
  }

  const video = await resolveVideoMeta(videoId, adminPreview);
  if (!video) return new NextResponse("gone", { status: 410 });

  let key: string;
  let presignKind: "asset" | "stream";
  let cacheOpts: { siteId: string; videoId: string; file?: string; token?: string };

  if (file) {
    switch (file) {
      case "thumbnail.jpg":
        key = s3Keys.thumb(video.siteId, videoId);
        break;
      case "preview.mp4":
        key = s3Keys.preview(video.siteId, videoId);
        break;
      case "storyboard.jpg":
        key = s3Keys.storyboard(video.siteId, videoId);
        break;
      case "storyboard.vtt":
        key = s3Keys.storyboardVtt(video.siteId, videoId);
        break;
      default:
        return new NextResponse("bad file", { status: 400 });
    }
    presignKind = "asset";
    cacheOpts = { siteId: video.siteId, videoId, file };
  } else {
    if (
      !streamClaim ||
      streamClaim.videoId !== videoId ||
      streamClaim.siteId !== video.siteId
    ) {
      logger.warn({ videoId }, "cdn authorize: stream token mismatch");
      return new NextResponse("forbidden", { status: 403 });
    }
    key = s3Keys.video(video.siteId, videoId);
    presignKind = "stream";
    cacheOpts = { siteId: video.siteId, videoId, token };
  }

  const cached = await getCachedPresign(presignKind, cacheOpts);
  if (cached) {
    return okWithPresign(cached.url, cached.host);
  }

  const presigned = await presignGet(key, CDN_PRESIGN_SECONDS);
  const host = new URL(presigned).host;
  await setCachedPresign(presignKind, cacheOpts, { url: presigned, host });
  return okWithPresign(presigned, host);
}

async function resolveVideoMeta(
  videoId: string,
  adminPreview: boolean
): Promise<CdnVideoMeta | null> {
  const cached = await getCachedVideoMeta(videoId);
  if (cached) {
    if (cached.isDeleted && !adminPreview) return null;
    return cached;
  }

  const row = await prisma.video.findFirst({
    where: { id: videoId },
    select: { siteId: true, isDeleted: true },
  });
  if (!row) return null;

  const meta: CdnVideoMeta = { siteId: row.siteId, isDeleted: row.isDeleted };
  await setCachedVideoMeta(videoId, meta);

  if (meta.isDeleted && !adminPreview) return null;
  return meta;
}

function okWithPresign(url: string, host: string): NextResponse {
  const res = new NextResponse(null, { status: 200 });
  res.headers.set("X-S3-Url", url);
  // nginx must send this exact Host to S3 — a presigned GET signs the Host
  // header, so proxying with a different/empty Host yields SignatureDoesNotMatch.
  res.headers.set("X-S3-Host", host);
  return res;
}
