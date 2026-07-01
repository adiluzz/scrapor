import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { openAdSession } from "@/lib/ad-session";

/**
 * Open a server-side ad session before playback. Returns the VAST tag URL (if
 * ads are configured) plus timing config. The stream token is only minted later
 * by /stream-grant after the ad completes or is confirmed unavailable.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await prisma.video.findFirst({ where: { id, isDeleted: false } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const vastTagUrl = process.env.VAST_TAG_URL || "";
  const adRequired = Boolean(vastTagUrl);
  const session = await openAdSession(video.id, video.siteId, adRequired);

  return NextResponse.json({
    adSessionId: session.id,
    adRequired,
    vastTagUrl: vastTagUrl || null,
    skipSeconds: parseInt(process.env.AD_SKIP_SECONDS || "5", 10),
    minViewSeconds: parseInt(process.env.AD_MIN_VIEW_SECONDS || "5", 10),
    timeoutMs: parseInt(process.env.AD_TIMEOUT_MS || "8000", 10),
  });
}
