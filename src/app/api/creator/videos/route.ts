import { NextResponse } from "next/server";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { guardCreator, isSessionAuth } from "@/lib/admin-guard";
import { upsertVideoWithMedia } from "@/lib/videos";
import { redis, CREATOR_QUEUE_KEY } from "@/lib/redis";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Large uploads stream straight to disk; allow a long request.
export const maxDuration = 3600;

// Shared volume the worker also mounts (see docker-compose `uploads`).
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024 * 1024); // 5 GB

/** Stream guard that aborts once more than `max` bytes have passed through. */
function sizeGuard(max: number) {
  let total = 0;
  return new Transform({
    transform(chunk, _enc, cb) {
      total += chunk.length;
      if (total > max) return cb(new Error("UPLOAD_TOO_LARGE"));
      cb(null, chunk);
    },
  });
}

/**
 * Accept a creator video upload THROUGH the server (raw request body), store it
 * on the shared volume, create a PENDING Video row, and enqueue it for the
 * worker to transcode + generate thumbnail/preview/storyboard and upload to S3.
 *
 * Metadata is passed as query params (title, description, tags, durationSec) so
 * the body is the raw file and can be streamed to disk without buffering.
 */
export async function POST(request: Request) {
  const auth = await guardCreator(request, "POST");
  if (auth instanceof NextResponse) return auth;
  if (!isSessionAuth(auth)) {
    return NextResponse.json({ error: "Creator session required" }, { status: 403 });
  }
  const user = auth;

  const creator = await prisma.creatorProfile.findUnique({ where: { userId: user.userId } });
  if (!creator) return NextResponse.json({ error: "No creator profile" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const title = (searchParams.get("title") || "").trim();
  if (title.length < 2 || title.length > 200) {
    return NextResponse.json({ error: "Title must be 2-200 characters" }, { status: 400 });
  }
  const description = (searchParams.get("description") || "").slice(0, 4000) || null;
  const tags = (searchParams.get("tags") || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30);
  const durationRaw = parseInt(searchParams.get("durationSec") || "", 10);
  const durationSec = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null;

  if (!request.body) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  const declaredLen = Number(request.headers.get("content-length") || 0);
  if (declaredLen && declaredLen > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  // 1. Stream the raw body to a temp file first (so a failed/oversized upload
  //    never leaves an orphan DB row).
  await mkdir(path.join(UPLOAD_ROOT, "tmp"), { recursive: true });
  const tmpPath = path.join(UPLOAD_ROOT, "tmp", `${crypto.randomUUID()}.part`);
  try {
    await pipeline(
      Readable.fromWeb(request.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>),
      sizeGuard(MAX_BYTES),
      createWriteStream(tmpPath)
    );
  } catch (e) {
    await rm(tmpPath, { force: true }).catch(() => {});
    const tooLarge = e instanceof Error && e.message === "UPLOAD_TOO_LARGE";
    logger.warn({ err: String(e) }, "creator upload stream failed");
    return NextResponse.json(
      { error: tooLarge ? "File too large" : "Upload failed" },
      { status: tooLarge ? 413 : 400 }
    );
  }

  // 2. Create the PENDING video row (unique sourceUrl → always a fresh row).
  const uploadId = crypto.randomUUID();
  const video = await upsertVideoWithMedia({
    siteId: user.siteId,
    sourceUrl: `upload://${creator.id}/${uploadId}`,
    title,
    description,
    durationSec,
    sourceSite: "creator-upload",
    creatorId: creator.id,
    status: "PENDING",
    tags,
  });

  // 3. Move the uploaded file under the video id (same volume → atomic rename)
  //    and enqueue it for the worker.
  try {
    const destDir = path.join(UPLOAD_ROOT, video.id);
    await mkdir(destDir, { recursive: true });
    await rename(tmpPath, path.join(destDir, "source"));
    await redis.rpush(CREATOR_QUEUE_KEY, video.id);
  } catch (e) {
    await rm(tmpPath, { force: true }).catch(() => {});
    await prisma.video
      .update({ where: { id: video.id }, data: { status: "FAILED" } })
      .catch(() => {});
    logger.error({ err: String(e), videoId: video.id }, "creator upload enqueue failed");
    return NextResponse.json({ error: "Could not queue processing" }, { status: 500 });
  }

  logger.info({ videoId: video.id, creatorId: creator.id }, "creator video uploaded, queued");
  return NextResponse.json({ ok: true, slug: video.slug, id: video.id, status: "PENDING" });
}
