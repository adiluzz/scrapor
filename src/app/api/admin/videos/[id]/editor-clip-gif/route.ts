import { createReadStream } from "node:fs";
import { NextResponse } from "next/server";
import { guardAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { ensureEditorClipGif } from "@/lib/video-editor-clip";
import { MAX_EDITOR_CLIP_DURATION_SEC } from "@/lib/video-editor-limits";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const DEFAULT_END = 30;

/**
 * Server-generated GIF for an ad clip segment. Query: startSec, endSec.
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
  const download = url.searchParams.get("download") === "1";
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
    const clip = await ensureEditorClipGif({ videoId: id, startSec, endSec });
    const video = await prisma.video.findUnique({
      where: { id },
      select: { title: true },
    });
    const stream = createReadStream(clip.path);
    const headers: Record<string, string> = {
      "Content-Type": "image/gif",
      "Content-Length": String(clip.bytes),
      "Cache-Control": "private, max-age=3600",
      "X-Editor-Clip-Start": String(clip.startSec),
      "X-Editor-Clip-End": String(clip.endSec),
    };
    if (download) {
      const base = (video?.title || "clip").replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-");
      headers["Content-Disposition"] = `attachment; filename="${base.slice(0, 100) || "clip"}.gif"`;
    }
    return new NextResponse(stream as unknown as ReadableStream, { headers });
  } catch (err) {
    logger.error({ err, videoId: id }, "editor-clip-gif failed");
    const msg = err instanceof Error ? err.message : "GIF export failed";
    const status = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
