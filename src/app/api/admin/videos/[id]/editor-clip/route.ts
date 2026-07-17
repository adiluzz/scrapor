import { createReadStream } from "node:fs";
import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { ensureEditorClip } from "@/lib/video-editor-clip";
import { MAX_EDITOR_CLIP_DURATION_SEC } from "@/lib/video-editor-limits";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const DEFAULT_END = 30;

/**
 * Server-extracted short clip for timeline preview. Avoids loading full tube files in the browser.
 * Query: startSec, endSec (max window MAX_EDITOR_CLIP_DURATION_SEC).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guardAdmin(request, "GET");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const url = new URL(request.url);
  const startSec = parseFloat(url.searchParams.get("startSec") || "0");
  const endSec = parseFloat(url.searchParams.get("endSec") || String(DEFAULT_END));
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
    return NextResponse.json({ error: "Invalid startSec/endSec" }, { status: 400 });
  }
  if (endSec - startSec > MAX_EDITOR_CLIP_DURATION_SEC + 0.01) {
    return NextResponse.json(
      { error: `Clip longer than ${MAX_EDITOR_CLIP_DURATION_SEC}s` },
      { status: 400 }
    );
  }

  try {
    const clip = await ensureEditorClip({ videoId: id, startSec, endSec });
    const stream = createReadStream(clip.path);
    return new NextResponse(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(clip.bytes),
        "Cache-Control": "private, max-age=3600",
        "X-Editor-Clip-Start": String(clip.startSec),
        "X-Editor-Clip-End": String(clip.endSec),
      },
    });
  } catch (err) {
    logger.error({ err, videoId: id }, "editor-clip failed");
    const msg = err instanceof Error ? err.message : "Clip extract failed";
    const status = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
