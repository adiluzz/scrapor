import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdSession } from "@/lib/ad-session";
import { allowAdTraffic } from "@/lib/ad-traffic";
import { getClientIp } from "@/lib/media";
import { getCurrentSite } from "@/lib/site";
import { headers } from "next/headers";
import { guardApiRoute } from "@/lib/admin-guard";

/**
 * Hand the VAST tags to the player. Fetching them from this server makes every
 * viewer look like one datacenter IP: HilltopAds blocked the account for that,
 * and ExoClick answers the same server with an empty VAST document. The browser
 * requests primary, then backup, with the visitor's own IP.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guardApiRoute(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const adSessionId = typeof body.adSessionId === "string" ? body.adSessionId : "";

  const video = await prisma.video.findFirst({ where: { id, isDeleted: false } });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = adSessionId ? await getAdSession(adSessionId) : null;
  if (!session || session.videoId !== video.id || session.consumed) {
    return NextResponse.json({ error: "Invalid ad session" }, { status: 403 });
  }

  const site = await getCurrentSite();
  const primary = site.vastTagUrl || "";
  const backup = site.vastTagUrlBackup || "";
  if (!primary && !backup) return NextResponse.json({ ad: null });

  const [clientIp, h] = await Promise.all([getClientIp(), headers()]);
  if (!(await allowAdTraffic(clientIp, h.get("user-agent")))) {
    return NextResponse.json({ ad: null });
  }

  return NextResponse.json({
    ad: null,
    clientVastTagUrl: primary || null,
    clientVastTagUrlBackup: backup || null,
  });
}
