import { NextResponse } from "next/server";
import { getSiteIdForAuth } from "@/lib/site";
import { trackSearch } from "@/lib/search";
import { guardApiRoute } from "@/lib/admin-guard";

export async function POST(request: Request) {
  const auth = await guardApiRoute(request, "POST");
  if (auth instanceof NextResponse) return auth;

  try {
    const { q } = await request.json();
    if (typeof q === "string" && q.trim()) {
      const siteId = await getSiteIdForAuth(auth);
      await trackSearch(siteId, q);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
