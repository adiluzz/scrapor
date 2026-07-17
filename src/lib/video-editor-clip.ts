import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { isS3Configured, s3, S3_BUCKET, s3Keys } from "@/lib/storage";
import { runProcess } from "@/lib/assistant-tools/utils";
import { MAX_EDITOR_CLIP_DURATION_SEC } from "@/lib/video-editor-limits";
import { logger } from "@/lib/logger";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || join(process.cwd(), "downloads");
const UPLOAD_ROOT = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
const CLIP_CACHE_DIR = join(UPLOAD_ROOT, "tmp", "editor-clips");

function clipCachePath(videoId: string, startSec: number, endSec: number): string {
  const a = Math.round(startSec * 1000);
  const b = Math.round(endSec * 1000);
  return join(CLIP_CACHE_DIR, `${videoId}_${a}_${b}.mp4`);
}

async function resolveSourcePath(videoId: string, siteId: string): Promise<string> {
  await mkdir(join(UPLOAD_ROOT, "tmp", "editor-src"), { recursive: true });
  const localCandidates = [
    join(DOWNLOADS_DIR, videoId, "video.mp4"),
    join(DOWNLOADS_DIR, videoId, "preview.mp4"),
  ];
  for (const p of localCandidates) {
    if (existsSync(p)) return p;
  }

  if (!isS3Configured()) {
    throw new Error("Video file not found locally and S3 is not configured");
  }

  const dest = join(UPLOAD_ROOT, "tmp", "editor-src", `${videoId}.mp4`);
  if (existsSync(dest)) {
    const st = await stat(dest);
    if (st.size > 0) return dest;
  }

  const key = s3Keys.video(siteId, videoId);
  const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  if (!obj.Body) throw new Error("Empty S3 object");

  await pipeline(
    Readable.fromWeb(obj.Body as unknown as import("node:stream/web").ReadableStream),
    createWriteStream(dest)
  );
  return dest;
}

/**
 * Extract a short MP4 segment for editor preview (cached). Returns absolute path to the clip file.
 */
export async function ensureEditorClip(input: {
  videoId: string;
  startSec: number;
  endSec: number;
}): Promise<{ path: string; startSec: number; endSec: number; bytes: number }> {
  const startSec = Math.max(0, input.startSec);
  let endSec = Math.max(startSec + 0.1, input.endSec);
  const dur = endSec - startSec;
  if (dur > MAX_EDITOR_CLIP_DURATION_SEC) {
    endSec = startSec + MAX_EDITOR_CLIP_DURATION_SEC;
  }

  const video = await prisma.video.findUnique({
    where: { id: input.videoId },
    select: { id: true, siteId: true, isDeleted: true },
  });
  if (!video || video.isDeleted) throw new Error("Video not found");

  await mkdir(CLIP_CACHE_DIR, { recursive: true });
  const outPath = clipCachePath(video.id, startSec, endSec);
  if (existsSync(outPath)) {
    const st = await stat(outPath);
    if (st.size > 1024) {
      return { path: outPath, startSec, endSec, bytes: st.size };
    }
  }

  const srcPath = await resolveSourcePath(video.id, video.siteId);
  const tmpOut = `${outPath}.partial.mp4`;
  await rm(tmpOut, { force: true }).catch(() => {});

  // Keyframe-accurate-ish extract with re-encode for a clean short preview file.
  // -ss after -i is slower but more accurate for highlight windows.
  const args = [
    "-y",
    "-ss",
    String(startSec),
    "-i",
    srcPath,
    "-t",
    String(endSec - startSec),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    tmpOut,
  ];

  const result = await runProcess("ffmpeg", args, { timeoutSeconds: 600 });
  if (result.exitCode !== 0 || !existsSync(tmpOut)) {
    logger.error(
      { videoId: video.id, startSec, endSec, stderr: result.stderr.slice(-800) },
      "editor-clip ffmpeg failed"
    );
    await rm(tmpOut, { force: true }).catch(() => {});
    throw new Error(result.timedOut ? "Clip extract timed out" : "Clip extract failed");
  }

  // Atomic-ish replace
  await rm(outPath, { force: true }).catch(() => {});
  const { rename } = await import("node:fs/promises");
  await rename(tmpOut, outPath);
  const st = await stat(outPath);
  return { path: outPath, startSec, endSec, bytes: st.size };
}
