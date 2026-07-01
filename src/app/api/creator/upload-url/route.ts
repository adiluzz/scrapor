import { NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentUser } from "@/lib/session";
import { presignPut, s3Keys, isS3Configured } from "@/lib/storage";

/**
 * Presign a direct-to-S3 PUT for a creator video upload. Returns a temporary
 * videoId (used as the S3 key namespace) + the upload URL.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "CREATOR" && user.role !== "ADMIN")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isS3Configured()) {
    return NextResponse.json({ error: "Uploads require S3 to be configured" }, { status: 503 });
  }

  const { contentType } = await request.json().catch(() => ({ contentType: "video/mp4" }));
  const tempId = crypto.randomUUID();
  const key = s3Keys.video(user.siteId, tempId);
  const url = await presignPut(key, contentType || "video/mp4", 900);

  return NextResponse.json({ uploadId: tempId, key, url });
}
