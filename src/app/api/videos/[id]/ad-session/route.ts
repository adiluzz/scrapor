import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { openAdSession } from "@/lib/ad-session";
import { guardApiRoute } from "@/lib/admin-guard";
import { getCurrentSite } from "@/lib/site";
import { isPubliclyPublished } from "@/lib/publication";

/**
 * Open a server-side ad session before playback. Returns the VAST tag URL (if
 * ads are configured) plus timing config. The stream token is only minted later
 * by /stream-grant after the ad completes or is confirmed unavailable.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guardApiRoute(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const video = await prisma.video.findFirst({ where: { id, isDeleted: false, status: "READY" } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const site = await getCurrentSite();
  if (!(await isPubliclyPublished(video.id, site.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const vastTagUrl = site.vastTagUrl || "";
  const vastTagUrlBackup = site.vastTagUrlBackup || "";
  const adRequired = Boolean(vastTagUrl || vastTagUrlBackup);
  const session = await openAdSession(video.id, site.id, adRequired);

  return NextResponse.json({
    adSessionId: session.id,
    adRequired,
    skipSeconds: site.adSkipSeconds,
    minViewSeconds: site.adMinViewSeconds,
    timeoutMs: site.adTimeoutMs,
  });
}
