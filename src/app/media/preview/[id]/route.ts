import { NextResponse } from "next/server";
import { existsSync, createReadStream, statSync } from "fs";
import { join } from "path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { getSiteIdForAuth } from "@/lib/site";
import { isS3Configured, s3, S3_BUCKET, s3Keys } from "@/lib/storage";
import { guardApiRoute } from "@/lib/admin-guard";

const DOWNLOADS_DIR = join(process.cwd(), "downloads");

/**
 * Public preview clip for Google Video Sitemap crawlers (video:content_loc).
 * Serves preview.mp4 from S3 or local storage — no ad gate or IP-bound CDN URLs.
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
    select: { id: true, siteId: true },
  });
  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isS3Configured()) {
    for (const key of [s3Keys.preview(video.siteId, video.id), s3Keys.video(video.siteId, video.id)]) {
      try {
        const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
        if (!obj.Body) continue;
        const bytes = await obj.Body.transformToByteArray();
        return new NextResponse(Buffer.from(bytes), {
          headers: {
            "Content-Type": "video/mp4",
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch {
        // try next key
      }
    }
    return NextResponse.json({ error: "Preview missing" }, { status: 404 });
  }

  for (const name of ["preview.mp4", "video.mp4"]) {
    const path = join(DOWNLOADS_DIR, id, name);
    if (!existsSync(path)) continue;
    const stat = statSync(path);
    return new NextResponse(createReadStream(path) as unknown as ReadableStream, {
      headers: {
        "Content-Length": String(stat.size),
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  return NextResponse.json({ error: "Preview missing" }, { status: 404 });
}
