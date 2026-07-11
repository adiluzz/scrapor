import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdSession } from "@/lib/ad-session";
import { getClientIp } from "@/lib/media";
import { getCurrentSite } from "@/lib/site";
import { resolveVastAd } from "@/lib/vast";
import { headers } from "next/headers";
import { guardApiRoute } from "@/lib/admin-guard";

/**
 * Resolve the configured VAST tag server-side (ExoClick needs Referer + client IP
 * and often returns Wrapper VAST that must be followed before Inline MediaFile).
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
  const tagUrl = site.vastTagUrl || "";
  if (!tagUrl) return NextResponse.json({ ad: null });

  const [clientIp, h] = await Promise.all([getClientIp(), headers()]);
  const referer = `https://${site.domain}/videos/`;
  const userAgent = h.get("user-agent") || undefined;
  const timeoutMs = site.adTimeoutMs;

  const ad = await resolveVastAd(tagUrl, { clientIp, referer, userAgent, timeoutMs });
  return NextResponse.json({ ad });
}
