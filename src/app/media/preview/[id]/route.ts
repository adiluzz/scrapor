import { NextResponse } from "next/server";
import { existsSync, createReadStream, statSync } from "fs";
import { join } from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { getSiteIdForAuth } from "@/lib/site";
import { isS3Configured, s3, S3_BUCKET, s3Keys } from "@/lib/storage";
import { guardApiRoute } from "@/lib/admin-guard";

const DOWNLOADS_DIR = join(process.cwd(), "downloads");

function parseRange(range: string | null, size: number): { start: number; end: number } | null {
  if (!range || !range.startsWith("bytes=")) return null;
  const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : size - 1;
  if (!Number.isFinite(start) || start < 0 || end < start || end >= size) return null;
  return { start, end };
}

async function streamS3Key(key: string, request: Request): Promise<NextResponse> {
  const range = request.headers.get("range");
  const cmd = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ...(range ? { Range: range } : {}),
  });
  const obj = await s3.send(cmd);
  if (!obj.Body) return NextResponse.json({ error: "Empty object" }, { status: 404 });

  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=3600",
  });
  if (obj.ContentLength != null) headers.set("Content-Length", String(obj.ContentLength));
  if (obj.ContentRange) headers.set("Content-Range", obj.ContentRange);

  const status = range && obj.ContentRange ? 206 : 200;
  return new NextResponse(obj.Body.transformToWebStream(), { status, headers });
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
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  }

  return new NextResponse(createReadStream(path) as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

/**
 * Same-origin hover preview for grid cards (legacy + v2 MP4).
 * Streams from S3 with Range support so long legacy montages still play.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardApiRoute(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id || id.includes("..") || id.includes("/")) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const siteId = await getSiteIdForAuth(auth);
  const video = await prisma.video.findFirst({
    where: { id, siteId, isDeleted: false, status: "READY" },
    select: { id: true, siteId: true, s3PreviewKey: true },
  });
  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isS3Configured()) {
    if (video.s3PreviewKey) {
      try {
        return await streamS3Key(s3Keys.preview(video.siteId, video.id), request);
      } catch {
        return NextResponse.json({ error: "Preview missing" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Preview missing" }, { status: 404 });
  }

  for (const name of ["preview.mp4", "video.mp4"]) {
    const path = join(DOWNLOADS_DIR, id, name);
    if (existsSync(path)) return streamLocalFile(path, request);
  }

  return NextResponse.json({ error: "Preview missing" }, { status: 404 });
}
