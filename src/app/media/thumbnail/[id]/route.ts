import { NextResponse } from "next/server";
import { existsSync, createReadStream, statSync } from "fs";
import { join } from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { getSiteIdForAuth } from "@/lib/site";
import { isS3Configured, s3, S3_BUCKET, s3Keys } from "@/lib/storage";
import { guardApiRoute } from "@/lib/admin-guard";

const DOWNLOADS_DIR = join(process.cwd(), "downloads");
const EXTENSIONS = ["thumbnail.jpg", "thumbnail.jpeg", "thumbnail.png", "thumbnail.webp"];

/**
 * Public thumbnail endpoint for Google Video Sitemap crawlers.
 * Serves from S3 or local downloads — no IP-bound CDN signatures.
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
    select: { id: true, siteId: true, s3ThumbKey: true },
  });
  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isS3Configured()) {
    const key = video.s3ThumbKey || s3Keys.thumb(video.siteId, video.id);
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      if (!obj.Body) {
        return NextResponse.json({ error: "Thumbnail missing" }, { status: 404 });
      }
      const bytes = await obj.Body.transformToByteArray();
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": obj.ContentType || "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return NextResponse.json({ error: "Thumbnail missing" }, { status: 404 });
    }
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
      "Cache-Control": "public, max-age=86400",
    },
  });
}
