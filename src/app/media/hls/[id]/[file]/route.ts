import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Full HLS used to be proxied through this process for sitemap crawlers.
 * Playback is signed CloudFront only. These URLs no longer send video bytes.
 */
export async function GET() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
