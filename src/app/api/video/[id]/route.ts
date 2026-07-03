import { NextResponse } from "next/server";
import { existsSync, createReadStream, statSync } from "fs";
import { join } from "path";
import { guardApiRoute } from "@/lib/admin-guard";

const DOWNLOADS_DIR = join(process.cwd(), "downloads");

function resolveVideoPath(id: string): string | null {
  // New layout: downloads/{id}/video.mp4
  const newPath = join(DOWNLOADS_DIR, id, "video.mp4");
  if (existsSync(newPath)) return newPath;
  // Legacy flat layout: downloads/{id}.mp4 / .webm
  const mp4 = join(DOWNLOADS_DIR, `${id}.mp4`);
  if (existsSync(mp4)) return mp4;
  const webm = join(DOWNLOADS_DIR, `${id}.webm`);
  if (existsSync(webm)) return webm;
  return null;
}

function streamFile(filePath: string, request: Request, contentType: string) {
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
        "Content-Type": contentType,
      },
    });
  }

  return new NextResponse(createReadStream(filePath) as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    },
  });
}

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

  const videoPath = resolveVideoPath(id);
  if (!videoPath) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  const contentType = videoPath.endsWith(".webm") ? "video/webm" : "video/mp4";
  return streamFile(videoPath, request, contentType);
}
