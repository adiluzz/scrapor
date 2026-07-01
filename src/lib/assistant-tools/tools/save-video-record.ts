import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import {
  join,
  runProcess,
  saveVideoFileToDownloads,
  saveThumbnailToDownloads,
  thumbnailFilePath,
  upsertVideoRecord,
  videoDir,
} from "@/lib/assistant-tools/utils";
import { unlink, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tool } from "ai";
import { z } from "zod";

/**
 * Single-pass thumbnail: select first 5 s of every 60 s block.
 * No temp files — low memory, works for any video length.
 */
async function makeThumbnail(sourcePath: string, destPath: string, timeout: number): Promise<boolean> {
  const selectExpr = "lt(mod(t,60),5)";
  const tryRun = async (withAudio: boolean) => {
    const args = withAudio
      ? [
          "-i", sourcePath,
          "-filter_complex",
          `[0:v]select='${selectExpr}',setpts=N/FRAME_RATE/TB,scale=trunc(iw/2)*2:trunc(ih/2)*2[v];` +
          `[0:a]aselect='${selectExpr}',asetpts=N/SR/TB[a]`,
          "-map", "[v]", "-map", "[a]",
          "-c:v", "libx264", "-crf", "26", "-preset", "fast",
          "-c:a", "aac", "-b:a", "96k",
          "-y", destPath,
        ]
      : [
          "-i", sourcePath,
          "-vf",
          `select='${selectExpr}',setpts=N/FRAME_RATE/TB,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
          "-an",
          "-c:v", "libx264", "-crf", "26", "-preset", "fast",
          "-y", destPath,
        ];
    const r = await runProcess("ffmpeg", args, { timeoutSeconds: Math.min(timeout, 1800) });
    return r.exitCode === 0;
  };
  return (await tryRun(true)) || (await tryRun(false));
}

/**
 * Download a thumbnail image from a URL and save it locally.
 * Falls back to ffmpeg frame extraction if the URL download fails.
 * Returns the local API path or null if both methods fail.
 */
async function saveThumbnailImage(
  videoId: string,
  destDir: string,
  thumbnailUrl: string | undefined,
  videoFilePath: string,
): Promise<string | null> {
  const destJpg = join(destDir, "thumbnail.jpg");
  if (existsSync(destJpg)) return `/api/thumbnail-img/${videoId}`;

  // Try downloading from provided URL
  if (thumbnailUrl?.startsWith("http")) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const res = await fetch(thumbnailUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      clearTimeout(timer);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 1000) {
          await writeFile(destJpg, buf);
          return `/api/thumbnail-img/${videoId}`;
        }
      }
    } catch {
      // fall through to ffmpeg
    }
  }

  // Fallback: extract a single frame at 5s using ffmpeg
  if (existsSync(videoFilePath)) {
    const r = await runProcess("ffmpeg", [
      "-y", "-ss", "5", "-i", videoFilePath,
      "-vframes", "1", "-q:v", "2", destJpg,
    ], { timeoutSeconds: 60 });
    if (r.exitCode === 0 && existsSync(destJpg)) {
      return `/api/thumbnail-img/${videoId}`;
    }
  }

  return null;
}

const assistantTool = {
  key: "saveVideoRecord",
  description:
    "Register a downloaded video file in the app: creates the database record with full metadata (title, description, tags, pornstars), moves the file to downloads/{id}/video.mp4, downloads the thumbnail image, and generates thumbnail.mp4. Call this after downloadVideoFile.",
  createTool: () =>
    tool({
      description:
        "Save a locally downloaded video into the app. " +
        "Creates a full database record with all metadata, moves the file to downloads/{videoId}/video.mp4, " +
        "downloads the thumbnail image to downloads/{videoId}/thumbnail.jpg, " +
        "and generates a thumbnail preview clip (thumbnail.mp4). This is step 2 of 2 after downloadVideoFile.",
      parameters: z.object({
        localFilePath: z
          .string()
          .describe("Absolute path to the downloaded video file (returned by downloadVideoFile)."),
        videoUrl: z
          .string()
          .describe("The original video page URL (used as the DB record's URL field)."),
        title: z
          .string()
          .describe("Video title."),
        description: z
          .string()
          .optional()
          .describe("Video description. Pass empty string if not available."),
        tags: z
          .array(z.string())
          .optional()
          .describe("List of tag strings."),
        pornstars: z
          .array(z.string())
          .optional()
          .describe("List of pornstar name strings."),
        thumbnail: z
          .string()
          .optional()
          .describe("Thumbnail image URL (from the site or yt-dlp metadata)."),
        duration: z
          .string()
          .optional()
          .describe("Duration string in MM:SS format, e.g. '12:34'."),
        generateThumbnailVideo: z
          .boolean()
          .optional()
          .describe("Whether to generate a thumbnail.mp4 preview clip. Defaults to true."),
        timeoutSeconds: z
          .number()
          .min(30)
          .max(7200)
          .optional()
          .describe("Max time for thumbnail generation in seconds. Defaults to 1800."),
      }),
      execute: async ({
        localFilePath,
        videoUrl,
        title,
        description,
        tags,
        pornstars,
        thumbnail,
        duration,
        generateThumbnailVideo = true,
        timeoutSeconds = 1800,
      }) => {
        try {
          // 1. Create / update DB record with all metadata
          const video = await upsertVideoRecord({
            url: videoUrl,
            title: title.slice(0, 400),
            thumbnail: thumbnail || null,
            duration: duration || null,
            description: description || null,
            tags: tags || [],
            pornstars: pornstars || [],
          });

          // 2. Move the file to downloads/{videoId}/video.mp4
          const dest = await saveVideoFileToDownloads(video.id, localFilePath, ".mp4");
          const destDir = videoDir(video.id);

          // 3. Download/extract thumbnail image → downloads/{videoId}/thumbnail.jpg
          let thumbnailImagePath: string | null = null;
          try {
            // Thumbnail is stored on the filesystem (downloads/{id}/thumbnail.jpg)
            // and served via /api/thumbnail-img/{id} when no S3 key is present.
            thumbnailImagePath = await saveThumbnailImage(video.id, destDir, thumbnail, dest);
          } catch {
            // thumbnail image failure must never abort the save
          }

          // 4. Generate thumbnail.mp4 preview clip
          let previewFile: string | null = null;
          if (generateThumbnailVideo) {
            try {
              const tmpThumb = join(
                process.cwd(),
                "library",
                "assistant-recordings",
                `${video.id}-thumb.mp4`
              );
              const ok = await makeThumbnail(dest, tmpThumb, timeoutSeconds);
              if (ok) {
                previewFile = await saveThumbnailToDownloads(video.id, tmpThumb);
                await unlink(tmpThumb).catch(() => {});
              }
            } catch {
              // thumbnail video failure must never abort the save
            }
          }

          // 5. Clean up the source file from recordings folder (already moved)
          try { await unlink(localFilePath); } catch {}

          return JSON.stringify({
            ok: true,
            videoId: video.id,
            title: video.title,
            videoFile: dest,
            thumbnailImage: thumbnailImagePath,
            previewFile,
            watchUrl: `http://localhost:3000/watch/${video.id}`,
            homepage: "http://localhost:3000",
          });
        } catch (e) {
          return JSON.stringify({
            ok: false,
            error: (e as Error).message || "saveVideoRecord failed",
          });
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
