import { createReadStream, existsSync, statSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import {
  isS3Configured,
  resolveVideoStorageKey,
  s3,
  S3_BUCKET,
} from "@/lib/storage";

const DOWNLOADS_DIR = join(process.cwd(), "downloads");

function attachmentFilename(name: string): string {
  const safe = name.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 120);
  return safe.endsWith(".mp4") ? safe : `${safe || "video"}.mp4`;
}

function withDownloadHeaders(
  headers: Record<string, string>,
  request: Request,
  filename: string
): Record<string, string> {
  const url = new URL(request.url);
  if (url.searchParams.get("download") !== "1") return headers;
  return {
    ...headers,
    "Content-Disposition": `attachment; filename="${attachmentFilename(filename)}"`,
  };
}

function streamLocalFile(filePath: string, request: Request, filename: string) {
  const stat = statSync(filePath);
  const range = request.headers.get("range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    return new NextResponse(createReadStream(filePath, { start, end }) as unknown as ReadableStream, {
      status: 206,
      headers: withDownloadHeaders(
        {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": "video/mp4",
        },
        request,
        filename
      ),
    });
  }

  return new NextResponse(createReadStream(filePath) as unknown as ReadableStream, {
    headers: withDownloadHeaders(
      {
        "Content-Length": String(stat.size),
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
      },
      request,
      filename
    ),
  });
}

async function streamS3File(key: string, request: Request, filename: string) {
  const range = request.headers.get("range");
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ...(range ? { Range: range } : {}),
    })
  );
  if (!obj.Body) return NextResponse.json({ error: "Empty object" }, { status: 404 });

  const headers = withDownloadHeaders(
    {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    },
    request,
    filename
  );
  if (obj.ContentLength != null) {
    (headers as Record<string, string>)["Content-Length"] = String(obj.ContentLength);
  }
  if (obj.ContentRange) {
    (headers as Record<string, string>)["Content-Range"] = obj.ContentRange;
  }

  const status = range && obj.ContentRange ? 206 : 200;
  return new NextResponse(obj.Body.transformToWebStream(), { status, headers });
}

/** Same-origin admin video stream with byte-range support for clip review. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const video = await prisma.video.findUnique({ where: { id } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const filename = video.title || "video";

  if (isS3Configured()) {
    try {
      return await streamS3File(resolveVideoStorageKey(video), request, filename);
    } catch {
      return NextResponse.json({ error: "Video missing" }, { status: 404 });
    }
  }

  for (const name of ["video.mp4", "preview.mp4"]) {
    const path = join(DOWNLOADS_DIR, video.id, name);
    if (existsSync(path)) return streamLocalFile(path, request, filename);
  }

  return NextResponse.json({ error: "Video missing" }, { status: 404 });
}
