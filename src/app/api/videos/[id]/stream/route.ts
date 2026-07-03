import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardApiRoute } from "@/lib/admin-guard";
import { getSiteIdForAuth } from "@/lib/site";
import { mintStreamUrl } from "@/lib/cdn";
import { isS3Configured } from "@/lib/storage";

/**
 * API-consumer path for full video retrieval (no ad flow).
 * Requires session or READ_ONLY / FULL_ACCESS API key.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardApiRoute(request, "GET");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const siteId = await getSiteIdForAuth(auth);

  const video = await prisma.video.findFirst({
    where: { id, siteId, isDeleted: false },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "0.0.0.0";

  if (!isS3Configured()) {
    return NextResponse.json({ url: `/api/video/${video.id}` });
  }

  const url = mintStreamUrl({
    videoId: video.id,
    siteId: video.siteId,
    clientIp: ip,
    adSessionId: "api-key",
  });

  return NextResponse.json({ url, videoId: video.id, title: video.title });
}
