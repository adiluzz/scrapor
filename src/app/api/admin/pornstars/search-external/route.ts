import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { isTpdbConfigured, searchTpdbPerformers } from "@/lib/theporndb";

/** Search ThePornDB for performer matches (admin picker). */
export async function GET(request: Request) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;

  if (!isTpdbConfigured()) {
    return NextResponse.json(
      { error: "ThePornDB API key not configured", configured: false, performers: [] },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ performers: [], configured: true });
  }

  try {
    const performers = await searchTpdbPerformers(q);
    return NextResponse.json({
      configured: true,
      performers: performers.map((p) => ({
        id: p.id,
        name: p.name,
        disambiguation: p.disambiguation,
        imageUrl: p.images[0]?.url ?? null,
        imageCount: p.images.length,
        images: p.images.map((img) => ({
          id: img.id,
          url: img.url,
          width: img.width ?? null,
          height: img.height ?? null,
        })),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message, configured: true }, { status: 500 });
  }
}
