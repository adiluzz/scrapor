import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { ensureVideoPosterBytes } from "@/lib/video-thumbnail";

/** Poster JPEG for admin clip cards (generates past brand intro on compiled exports). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const bytes = await ensureVideoPosterBytes(id);
  if (!bytes?.length) {
    return NextResponse.json({ error: "Poster unavailable" }, { status: 404 });
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
