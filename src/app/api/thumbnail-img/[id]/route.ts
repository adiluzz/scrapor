import { NextResponse } from "next/server";
import { existsSync, createReadStream, statSync } from "fs";
import { join } from "path";

const DOWNLOADS_DIR = join(process.cwd(), "downloads");
const EXTENSIONS = ["thumbnail.jpg", "thumbnail.jpeg", "thumbnail.png", "thumbnail.webp"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || id.includes("..") || id.includes("/")) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let found: string | null = null;
  let mimeType = "image/jpeg";
  for (const name of EXTENSIONS) {
    const candidate = join(DOWNLOADS_DIR, id, name);
    if (existsSync(candidate)) {
      found = candidate;
      mimeType = name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
      break;
    }
  }

  if (!found) {
    return NextResponse.json({ error: "Thumbnail image not found" }, { status: 404 });
  }

  const stat = statSync(found);
  return new NextResponse(createReadStream(found) as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
