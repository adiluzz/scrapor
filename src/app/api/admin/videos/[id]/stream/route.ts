import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { existsSync, createReadStream, statSync } from "fs";
import { join } from "path";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { guardAdmin } from "@/lib/admin-guard";
import { isS3Configured, s3, S3_BUCKET, s3Keys } from "@/lib/storage";

const DOWNLOADS_DIR = join(process.cwd(), "downloads");

function streamLocalFile(filePath: string, request: Request) {
  const stat = statSync(filePath);
  const range = request.headers.get("range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    return new NextResponse(createReadStream(filePath, { start, end }) as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": "video/mp4",
      },
    });
  }

  return new NextResponse(createReadStream(filePath) as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    },
  });
}

async function streamS3File(key: string, request: Request) {
  const head = await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  const total = head.ContentLength ?? 0;
  const range = request.headers.get("range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Range: `bytes=${start}-${end}`,
      })
    );
    if (!obj.Body) return NextResponse.json({ error: "Empty object" }, { status: 404 });
    return new NextResponse(Readable.toWeb(obj.Body as Readable) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": "video/mp4",
      },
    });
  }

  const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  if (!obj.Body) return NextResponse.json({ error: "Empty object" }, { status: 404 });
  return new NextResponse(Readable.toWeb(obj.Body as Readable) as ReadableStream, {
    headers: {
      "Content-Length": String(total),
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    },
  });
}

/** Same-origin admin video stream with byte-range support for clip review. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const video = await prisma.video.findFirst({ where: { id, siteId: auth.siteId } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (isS3Configured()) {
    try {
      return await streamS3File(s3Keys.video(video.siteId, video.id), request);
    } catch {
      return NextResponse.json({ error: "Video missing" }, { status: 404 });
    }
  }

  for (const name of ["video.mp4", "preview.mp4"]) {
    const path = join(DOWNLOADS_DIR, video.id, name);
    if (existsSync(path)) return streamLocalFile(path, request);
  }

  return NextResponse.json({ error: "Video missing" }, { status: 404 });
}
