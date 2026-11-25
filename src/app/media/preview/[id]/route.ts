import { NextResponse } from "next/server";
import { existsSync, createReadStream, statSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/db";
import { getSiteIdForAuth } from "@/lib/site";
import { isS3Configured } from "@/lib/storage";
import { guardApiRoute } from "@/lib/admin-guard";
import { publicOnSite } from "@/lib/publication";

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
 * Local-dev hover preview only. Production cards use a signed CloudFront URL,
 * and this route does not proxy S3.
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
    where: {
      id,
      isDeleted: false,
      status: "READY",
      sites: publicOnSite(siteId),
    },
    select: { id: true },
  });
  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Production hover previews are signed CloudFront URLs. Do not proxy the
  // clip (or a full MP4) through this process.
  if (isS3Configured()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const path = join(DOWNLOADS_DIR, id, "preview.mp4");
  if (existsSync(path)) return streamLocalFile(path, request);

  return NextResponse.json({ error: "Preview missing" }, { status: 404 });
}
