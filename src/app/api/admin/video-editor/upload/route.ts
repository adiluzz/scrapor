import { NextResponse } from "next/server";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { guardAdmin, authUserId } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { upsertVideoWithMedia } from "@/lib/videos";
import { isS3Configured, s3Keys, uploadBuffer } from "@/lib/storage";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const MAX_BYTES = Number(process.env.MAX_EDITOR_UPLOAD_BYTES || 2 * 1024 * 1024 * 1024);

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
 * Upload an exported MP4 into the library as a READY video.
 * Query: siteId, title, jobId?, durationSec?
 * Body: raw video/mp4 stream
 */
export async function POST(request: Request) {
  const auth = await guardAdmin(request);
  if (auth instanceof NextResponse) return auth;
  const userId = authUserId(auth);

  const { searchParams } = new URL(request.url);
  const siteId = (searchParams.get("siteId") || "").trim();
  const title = (searchParams.get("title") || "Edited video").trim().slice(0, 200);
  const jobId = (searchParams.get("jobId") || "").trim() || null;
  const durationRaw = parseInt(searchParams.get("durationSec") || "", 10);
  const durationSec = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : null;

  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  if (!request.body) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  await mkdir(path.join(UPLOAD_ROOT, "tmp"), { recursive: true });
  const tmpPath = path.join(UPLOAD_ROOT, "tmp", `${crypto.randomUUID()}.mp4`);
  try {
    await pipeline(
      Readable.fromWeb(request.body as unknown as import("node:stream/web").ReadableStream<Uint8Array>),
      sizeGuard(MAX_BYTES),
      createWriteStream(tmpPath)
    );
  } catch (e) {
    await rm(tmpPath, { force: true }).catch(() => {});
    const tooLarge = e instanceof Error && e.message === "UPLOAD_TOO_LARGE";
    return NextResponse.json(
      { error: tooLarge ? "File too large" : "Upload failed" },
      { status: tooLarge ? 413 : 400 }
    );
  }

  try {
    const buf = await readFile(tmpPath);
    const uploadId = crypto.randomUUID();
    const video = await upsertVideoWithMedia({
      siteId,
      publishSiteIds: [],
      sourceUrl: `editor://${siteId}/${uploadId}`,
      title,
      description: "Created in admin Video editor — publish from Ad clips when ready",
      durationSec,
      sourceSite: "VideoEditor",
      status: "PENDING",
      tags: ["edited"],
    });

    if (isS3Configured()) {
      const key = s3Keys.video(siteId, video.id);
      await uploadBuffer(key, buf, "video/mp4");
      await prisma.video.update({
        where: { id: video.id },
        data: { s3VideoKey: key },
      });
    }

    if (jobId) {
      await prisma.videoEditorJob.updateMany({
        where: { id: jobId, siteId },
        data: { resultVideoId: video.id, status: "DONE" },
      });
    }

    logger.info({ videoId: video.id, siteId, userId, jobId }, "video-editor upload saved");
    return NextResponse.json({ ok: true, video: { id: video.id, slug: video.slug, title: video.title } });
  } catch (err) {
    logger.error({ err }, "video-editor upload failed");
    return NextResponse.json({ error: "Failed to save video" }, { status: 500 });
  } finally {
    await rm(tmpPath, { force: true }).catch(() => {});
  }
}
