import { NextResponse } from "next/server";
import { existsSync, createReadStream, statSync } from "fs";
import { join } from "path";
import { guardApiRoute } from "@/lib/admin-guard";

const DOWNLOADS_DIR = join(process.cwd(), "downloads");

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

  const thumbPath = join(DOWNLOADS_DIR, id, "thumbnail.mp4");
  if (!existsSync(thumbPath)) {
    return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });
  }

  const stat = statSync(thumbPath);
  const range = request.headers.get("range");

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    return new NextResponse(createReadStream(thumbPath, { start, end }) as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": "video/mp4",
      },
    });
  }

  return new NextResponse(createReadStream(thumbPath) as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
    },
  });
}
