import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { getSiteIdForAuth } from "@/lib/site";
import { isS3Configured, s3, S3_BUCKET, s3Keys } from "@/lib/storage";
import { guardApiRoute } from "@/lib/admin-guard";

/** Same-origin storyboard sprite for grid hover previews (sprite cycling fallback). */
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
    select: { id: true, siteId: true, s3StoryboardKey: true },
  });
  if (!video?.s3StoryboardKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isS3Configured()) {
    return NextResponse.json({ error: "Storyboard unavailable" }, { status: 404 });
  }

  try {
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Keys.storyboard(video.siteId, video.id),
      })
    );
    if (!obj.Body) return NextResponse.json({ error: "Empty object" }, { status: 404 });
    const headers = new Headers({
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    });
    if (obj.ContentLength != null) headers.set("Content-Length", String(obj.ContentLength));
    return new NextResponse(obj.Body.transformToWebStream(), { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Storyboard missing" }, { status: 404 });
  }
}
