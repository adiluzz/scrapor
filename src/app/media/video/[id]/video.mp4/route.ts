import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Progressive MP4 used to be proxied through this process for sitemap crawlers.
 * Playback is signed CloudFront only. This URL no longer sends video bytes.
 */
export async function GET() {
  return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
