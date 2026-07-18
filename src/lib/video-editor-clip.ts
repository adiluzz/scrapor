import { existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import {
  downloadS3ObjectToFile,
  isS3Configured,
  resolveVideoStorageKey,
} from "@/lib/storage";
import { runProcess } from "@/lib/assistant-tools/utils";
import { MAX_EDITOR_CLIP_DURATION_SEC, MAX_GIF_DURATION_SEC } from "@/lib/video-editor-limits";
import { logger } from "@/lib/logger";

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || join(process.cwd(), "downloads");
const UPLOAD_ROOT = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
const CLIP_CACHE_DIR = join(UPLOAD_ROOT, "tmp", "editor-clips");
const GIF_CACHE_DIR = join(UPLOAD_ROOT, "tmp", "editor-clips-gif");

function clipCachePath(videoId: string, startSec: number, endSec: number): string {
  const a = Math.round(startSec * 1000);
  const b = Math.round(endSec * 1000);
  return join(CLIP_CACHE_DIR, `${videoId}_${a}_${b}.mp4`);
}

function gifCachePath(videoId: string, startSec: number, endSec: number): string {
  const a = Math.round(startSec * 1000);
  const b = Math.round(endSec * 1000);
  return join(GIF_CACHE_DIR, `${videoId}_${a}_${b}.gif`);
}

async function resolveSourcePath(
  videoId: string,
  siteId: string,
  s3VideoKey?: string | null
): Promise<string> {
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

  const key = s3VideoKey || resolveVideoStorageKey({ id: videoId, siteId });
  await downloadS3ObjectToFile(key, dest);
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
    select: { id: true, siteId: true, s3VideoKey: true, isDeleted: true },
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

  const srcPath = await resolveSourcePath(video.id, video.siteId, video.s3VideoKey);
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

/**
 * Extract a short GIF segment for ad-clip download (cached). Returns absolute path to the GIF file.
 */
export async function ensureEditorClipGif(input: {
  videoId: string;
  startSec: number;
  endSec: number;
}): Promise<{ path: string; startSec: number; endSec: number; bytes: number }> {
  const startSec = Math.max(0, input.startSec);
  let endSec = Math.max(startSec + 0.1, input.endSec);
  const requestedDur = endSec - startSec;
  if (requestedDur > MAX_GIF_DURATION_SEC) {
    endSec = startSec + MAX_GIF_DURATION_SEC;
  }
  const dur = endSec - startSec;
  if (dur > MAX_EDITOR_CLIP_DURATION_SEC) {
    endSec = startSec + MAX_EDITOR_CLIP_DURATION_SEC;
  }

  const video = await prisma.video.findUnique({
    where: { id: input.videoId },
    select: { id: true, siteId: true, s3VideoKey: true, isDeleted: true },
  });
  if (!video || video.isDeleted) throw new Error("Video not found");

  await mkdir(GIF_CACHE_DIR, { recursive: true });
  const outPath = gifCachePath(video.id, startSec, endSec);
  if (existsSync(outPath)) {
    const st = await stat(outPath);
    if (st.size > 512) {
      return { path: outPath, startSec, endSec, bytes: st.size };
    }
  }

  const srcPath = await resolveSourcePath(video.id, video.siteId, video.s3VideoKey);
  const tmpOut = `${outPath}.partial.gif`;
  await rm(tmpOut, { force: true }).catch(() => {});

  const fps = dur > 15 ? 8 : 10;
  const vf = [
    `fps=${fps}`,
    "scale=480:-1:flags=lanczos",
    "split[s0][s1]",
    "[s0]palettegen=stats_mode=diff[p]",
    "[s1]paletteuse=dither=bayer:bayer_scale=3[p]",
  ].join(",");

  const args = [
    "-y",
    "-ss",
    String(startSec),
    "-i",
    srcPath,
    "-t",
    String(endSec - startSec),
    "-vf",
    vf,
    "-loop",
    "0",
    tmpOut,
  ];

  const result = await runProcess("ffmpeg", args, { timeoutSeconds: 600 });
  if (result.exitCode !== 0 || !existsSync(tmpOut)) {
    logger.error(
      { videoId: video.id, startSec, endSec, stderr: result.stderr.slice(-800) },
      "editor-clip-gif ffmpeg failed"
    );
    await rm(tmpOut, { force: true }).catch(() => {});
    throw new Error(result.timedOut ? "GIF export timed out" : "GIF export failed");
  }

  await rm(outPath, { force: true }).catch(() => {});
  const { rename } = await import("node:fs/promises");
  await rename(tmpOut, outPath);
  const st = await stat(outPath);
  return { path: outPath, startSec, endSec, bytes: st.size };
}
