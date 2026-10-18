import { createReadStream, existsSync, statSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { publishedVideoForMedia } from "@/lib/public-video-media";
import { streamS3Object } from "@/lib/s3-object-stream";
import { isS3Configured, s3Keys } from "@/lib/storage";

export const dynamic = "force-dynamic";

const CACHE = "public, max-age=86400";
const DOWNLOADS_DIR = join(process.cwd(), "downloads");

function parseRange(range: string | null, size: number): { start: number; end: number } | null {
  if (!range || !range.startsWith("bytes=")) return null;
  const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : size - 1;
  if (!Number.isFinite(start) || start < 0 || end < start || end >= size) return null;
  return { start, end };
}

function streamLocalFile(path: string, request: Request): NextResponse {
  const stat = statSync(path);
  const range = parseRange(request.headers.get("range"), stat.size);
  if (range) {
    const chunkSize = range.end - range.start + 1;
    return new NextResponse(
      createReadStream(path, { start: range.start, end: range.end }) as unknown as ReadableStream,
      {
        status: 206,
        headers: {
          "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": "video/mp4",
          "Cache-Control": CACHE,
        },
      }
    );
  }
  return new NextResponse(createReadStream(path) as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": CACHE,
    },
  });
}

/**
 * Full progressive MP4 for videos that have not been packaged as HLS yet.
 * Sitemap `content_loc` uses this only when there is no HLS master.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const video = await publishedVideoForMedia(request, id);
  if (!video) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  if (isS3Configured()) {
    const key = video.s3VideoKey;
    if (!key || key !== s3Keys.video(video.siteId, video.id)) {
      return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    return streamS3Object(key, request, "video/mp4", CACHE);
  }

  const path = join(DOWNLOADS_DIR, id, "video.mp4");
  if (!existsSync(path)) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return streamLocalFile(path, request);
}
