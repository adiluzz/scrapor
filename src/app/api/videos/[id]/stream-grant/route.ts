import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdSession, consumeAdSession } from "@/lib/ad-session";
import { mintStreamUrl } from "@/lib/cdn";
import { isS3Configured } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { guardApiRoute } from "@/lib/admin-guard";
import { getCurrentSite } from "@/lib/site";

/**
 * Grant a short-lived signed CDN stream URL — only after the ad session is
 * satisfied. Outcome "complete"/"skip" require the minimum ad time to have
 * elapsed server-side; "noad"/"error" auto-grant (no ad was available).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guardApiRoute(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { adSessionId, outcome } = body as { adSessionId?: string; outcome?: string };

  const video = await prisma.video.findFirst({ where: { id, isDeleted: false } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = adSessionId ? await getAdSession(adSessionId) : null;
  if (!session || session.videoId !== video.id || session.consumed) {
    return NextResponse.json({ error: "Invalid ad session" }, { status: 403 });
  }

  const site = await getCurrentSite();
  const minView = site.adMinViewSeconds;
  const elapsed = (Date.now() - session.openedAt) / 1000;
  const adWatched = outcome === "complete" || outcome === "skip";
  const adUnavailable = outcome === "noad" || outcome === "error";

  if (session.adRequired && !adUnavailable) {
    if (!adWatched || elapsed < minView) {
      return NextResponse.json({ error: "Ad not completed" }, { status: 403 });
    }
  }

  await consumeAdSession(session);

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "0.0.0.0";

  const url = mintStreamUrl({
    videoId: video.id,
    siteId: video.siteId,
    clientIp: ip,
    adSessionId: session.id,
  });

  logger.info({ videoId: video.id, outcome, s3: isS3Configured() }, "stream granted");

  // In local dev (no S3/CDN) fall back to the local file stream so playback works.
  const fallback = !isS3Configured() ? `/api/video/${video.id}` : null;
  return NextResponse.json({ url: fallback || url });
}
