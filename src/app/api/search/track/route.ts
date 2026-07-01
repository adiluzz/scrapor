import { NextResponse } from "next/server";
import { getCurrentSiteId } from "@/lib/site";
import { trackSearch } from "@/lib/search";

export async function POST(request: Request) {
  try {
    const { q } = await request.json();
    if (typeof q === "string" && q.trim()) {
      const siteId = await getCurrentSiteId();
      await trackSearch(siteId, q);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
