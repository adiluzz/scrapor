import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdSession } from "@/lib/ad-session";
import { allowAdTraffic } from "@/lib/ad-traffic";
import { getClientIp } from "@/lib/media";
import { getCurrentSite } from "@/lib/site";
import { resolveVastAd } from "@/lib/vast";
import { headers } from "next/headers";
import { guardApiRoute } from "@/lib/admin-guard";

/**
 * Resolve the primary VAST tag server-side (ExoClick needs Referer + client IP
 * and often returns Wrapper VAST that must be followed before Inline MediaFile).
 *
 * The backup tag is not fetched here. Calling it from this server makes every
 * viewer look like one datacenter IP, which is what got the HilltopAds account
 * blocked. The player fetches that tag itself when the primary has no fill.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guardApiRoute(request, "POST");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const adSessionId = typeof body.adSessionId === "string" ? body.adSessionId : "";
  const retryPrimary = body.retryPrimary === true;

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
  const userAgent = h.get("user-agent");
  if (!(await allowAdTraffic(clientIp, userAgent))) {
    return NextResponse.json({ ad: null });
  }

  const opts = {
    clientIp,
    referer: `https://${site.domain}/videos/`,
    userAgent: userAgent || undefined,
    timeoutMs: site.adTimeoutMs,
  };

  if (retryPrimary) {
    const ad = primary ? await resolveVastAd(primary, opts) : null;
    return NextResponse.json({ ad });
  }

  const primaryAd = primary ? await resolveVastAd(primary, opts) : null;
  if (primaryAd) return NextResponse.json({ ad: primaryAd });

  if (backup) {
    return NextResponse.json({
      ad: null,
      clientVastTagUrl: backup,
      retryPrimary: Boolean(primary),
    });
  }

  const retry = primary ? await resolveVastAd(primary, opts) : null;
  return NextResponse.json({ ad: retry });
}
