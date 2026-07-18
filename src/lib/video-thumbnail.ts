import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prisma } from "@/lib/db";
import { adminThumbUrl } from "@/lib/media";
import { runProcess } from "@/lib/assistant-tools/utils";
import {
  downloadS3ObjectToFile,
  isS3Configured,
  objectExists,
  resolveVideoStorageKey,
  s3Keys,
  uploadBuffer,
} from "@/lib/storage";

/** Brand intro on compiled editor exports is ~2.5s — sample poster after it. */
export const COMPILED_POSTER_AT_SEC = 8;
export const COMPILED_THUMB_PREVIEW_VERSION = 3;

type VideoPosterRow = {
  id: string;
  siteId: string;
  s3VideoKey: string | null;
  s3ThumbKey: string | null;
  previewVersion: number | null;
  durationSec: number | null;
  sourceSite: string | null;
  sourceUrl: string;
  tags: { tag: { slug: string } }[];
};

export function isCompiledLibraryVideo(video: {
  sourceSite?: string | null;
  sourceUrl?: string;
  tags?: { tag: { slug: string } }[];
}): boolean {
  if (video.sourceSite === "VideoEditor") return true;
  if (video.sourceUrl?.startsWith("editor-compile://")) return true;
  return video.tags?.some((t) => t.tag.slug === "compiled") ?? false;
}

export function posterSampleSec(video: Pick<VideoPosterRow, "sourceSite" | "sourceUrl" | "durationSec" | "tags">): number {
  if (isCompiledLibraryVideo(video)) {
    const dur = video.durationSec ?? 30;
    return Math.min(12, Math.max(COMPILED_POSTER_AT_SEC, Math.floor(dur * 0.15)));
  }
  return 5;
}

async function loadVideoForPoster(videoId: string): Promise<VideoPosterRow | null> {
  return prisma.video.findUnique({
    where: { id: videoId },
    select: {
      id: true,
      siteId: true,
      s3VideoKey: true,
      s3ThumbKey: true,
      previewVersion: true,
      durationSec: true,
      sourceSite: true,
      sourceUrl: true,
      tags: { select: { tag: { select: { slug: true } } } },
    },
  });
}

function needsPosterRegeneration(video: VideoPosterRow): boolean {
  if (!video.s3VideoKey || !isS3Configured()) return false;
  if (isCompiledLibraryVideo(video)) {
    return (video.previewVersion ?? 0) < COMPILED_THUMB_PREVIEW_VERSION;
  }
  return !video.s3ThumbKey;
}

async function extractPosterJpeg(videoPath: string, destJpg: string, atSec: number): Promise<boolean> {
  const r = await runProcess(
    "ffmpeg",
    ["-y", "-ss", String(atSec), "-i", videoPath, "-frames:v", "1", "-q:v", "3", destJpg],
    { timeoutSeconds: 120 }
  );
  return r.exitCode === 0 && existsSync(destJpg);
}

/** Extract, upload, and persist a poster JPEG when missing or outdated (compiled intro skip). */
export async function ensureVideoPosterBytes(videoId: string): Promise<Buffer | null> {
  const video = await loadVideoForPoster(videoId);
  if (!video?.s3VideoKey) return null;

  const thumbKey = video.s3ThumbKey || s3Keys.thumb(video.siteId, video.id);

  if (!needsPosterRegeneration(video)) {
    if (!(await objectExists(thumbKey))) return null;
    const tmpDir = join(tmpdir(), `poster-${videoId}`);
    const dest = join(tmpDir, "thumbnail.jpg");
    try {
      await mkdir(tmpDir, { recursive: true });
      await downloadS3ObjectToFile(thumbKey, dest);
      return readFile(dest);
    } catch {
      return null;
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const tmpDir = join(tmpdir(), `poster-gen-${videoId}`);
  const videoPath = join(tmpDir, "video.mp4");
  const thumbPath = join(tmpDir, "thumbnail.jpg");
  try {
    await mkdir(tmpDir, { recursive: true });
    await downloadS3ObjectToFile(resolveVideoStorageKey(video), videoPath);
    const atSec = posterSampleSec(video);
    if (!(await extractPosterJpeg(videoPath, thumbPath, atSec))) return null;

    const bytes = await readFile(thumbPath);
    const uploadedKey = await uploadBuffer(thumbKey, bytes, "image/jpeg");
    await prisma.video.update({
      where: { id: video.id },
      data: {
        s3ThumbKey: uploadedKey,
        previewVersion: isCompiledLibraryVideo(video)
          ? COMPILED_THUMB_PREVIEW_VERSION
          : video.previewVersion ?? 2,
      },
    });
    return bytes;
  } catch {
    return null;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Resolve a poster URL for admin players (may trigger lazy generation). */
export async function ensureVideoPosterUrl(videoId: string): Promise<string | null> {
  const video = await loadVideoForPoster(videoId);
  if (!video) return null;

  if (needsPosterRegeneration(video)) {
    const ok = await ensureVideoPosterBytes(videoId);
    if (!ok) return null;
    const refreshed = await loadVideoForPoster(videoId);
    if (!refreshed) return null;
    return adminThumbUrl({ ...refreshed, isDeleted: false });
  }

  if (!video.s3ThumbKey && !isS3Configured()) return null;
  return adminThumbUrl({ ...video, isDeleted: false });
}
