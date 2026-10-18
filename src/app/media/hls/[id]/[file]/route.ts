import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { publicHlsObjectKey, publishedVideoForMedia, readS3Text, requestPublicOrigin } from "@/lib/public-video-media";
import { streamS3Object } from "@/lib/s3-object-stream";
import { isHlsMasterFile, isHlsSegmentFile, rewriteHlsPlaylistToOrigin } from "@/lib/video-sitemap";

export const dynamic = "force-dynamic";

const SEGMENT_CACHE = "public, max-age=86400";
const PLAYLIST_CACHE = "public, max-age=3600";

/**
 * Public, stable HLS for crawlers. `content_loc` in the video sitemap points here.
 * The master playlist is rewritten so every segment is an absolute URL on this
 * host (not a short-lived signed CDN link). Segments are the full VOD, not the
 * hover preview.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; file: string }> }
) {
  const { id, file } = await params;
  if (!isHlsMasterFile(file) && !isHlsSegmentFile(file)) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const video = await publishedVideoForMedia(request, id);
  if (!video) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const key = publicHlsObjectKey(video, file);
  if (!key) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  if (isHlsSegmentFile(file)) {
    return streamS3Object(key, request, "video/mp2t", SEGMENT_CACHE);
  }

  const playlist = await readS3Text(key);
  if (!playlist) {
    logger.warn({ videoId: video.id, key }, "hls master missing for public sitemap media");
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const body = rewriteHlsPlaylistToOrigin(playlist, requestPublicOrigin(request), video.id);
  if (!body) {
    logger.warn({ videoId: video.id, key }, "hls master is not a complete VOD playlist");
    return new NextResponse("Bad playlist", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Cache-Control": PLAYLIST_CACHE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
