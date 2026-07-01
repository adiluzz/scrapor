import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import {
  extname,
  join,
  mkdir,
  runProcess,
  saveVideoFileToDownloads,
  saveThumbnailToDownloads,
  upsertVideoRecord,
} from "@/lib/assistant-tools/utils";
import { unlink } from "fs/promises";
import { tool } from "ai";
import { z } from "zod";

/**
 * Single-pass thumbnail: ffmpeg streams through the source once,
 * selecting the first 5 s of every 60 s block via the select filter.
 * No temp files — low memory, works for any length video.
 */
async function makeThumbnailVideo(
  sourcePath: string,
  destPath: string,
  timeout: number
): Promise<boolean> {
  const selectExpr = "lt(mod(t,60),5)";

  const tryRun = async (withAudio: boolean) => {
    const args = withAudio
      ? [
          "-i", sourcePath,
          "-filter_complex",
          `[0:v]select='${selectExpr}',setpts=N/FRAME_RATE/TB,` +
          `scale=trunc(iw/2)*2:trunc(ih/2)*2[v];` +
          `[0:a]aselect='${selectExpr}',asetpts=N/SR/TB[a]`,
          "-map", "[v]", "-map", "[a]",
          "-c:v", "libx264", "-crf", "26", "-preset", "fast",
          "-c:a", "aac", "-b:a", "96k",
          "-y", destPath,
        ]
      : [
          "-i", sourcePath,
          "-vf",
          `select='${selectExpr}',setpts=N/FRAME_RATE/TB,` +
          `scale=trunc(iw/2)*2:trunc(ih/2)*2`,
          "-an",
          "-c:v", "libx264", "-crf", "26", "-preset", "fast",
          "-y", destPath,
        ];
    const r = await runProcess("ffmpeg", args, { timeoutSeconds: Math.min(timeout, 1800) });
    return r.exitCode === 0;
  };

  return (await tryRun(true)) || (await tryRun(false));
}

const assistantTool = {
  key: "downloadAndSaveVideo",
  description: "Download a direct video page URL and save it into app DB/homepage.",
  createTool: () =>
    tool({
      description:
        "Download a video page URL with yt-dlp and save directly to app DB/downloads so it appears on homepage.",
      parameters: z.object({
        videoUrl: z.string(),
        title: z.string().optional(),
        timeoutSeconds: z.number().min(30).max(7200).optional(),
      }),
      execute: async ({ videoUrl, title, timeoutSeconds }) => {
        try {
          const runYtDlp = async (args: string[], timeout: number) => {
            const direct = await runProcess("yt-dlp", args, { timeoutSeconds: timeout });
            if (direct.exitCode === -1 && /ENOENT|not found/i.test(direct.stderr || "")) {
              return runProcess("python3", ["-m", "yt_dlp", ...args], { timeoutSeconds: timeout });
            }
            return direct;
          };
          const recordingsDir = join(process.cwd(), "library", "assistant-recordings");
          await mkdir(recordingsDir, { recursive: true });
          const stem = `yt-${Date.now()}`;
          const outputTemplate = join(recordingsDir, `${stem}.%(ext)s`);
          const timeout = timeoutSeconds ?? 1800;

          const metaResult = await runYtDlp(
            ["--no-playlist", "--dump-single-json", videoUrl],
            Math.min(timeout, 300)
          );
          if (metaResult.exitCode !== 0 || !metaResult.stdout.trim()) {
            return JSON.stringify({
              ok: false,
              step: "metadata",
              error: (metaResult.stderr || metaResult.stdout || "yt-dlp metadata failed").slice(-2000),
            });
          }

          let meta: { title?: string; duration?: number; thumbnail?: string } = {};
          try {
            const firstJsonLine = metaResult.stdout
              .split("\n")
              .map((l) => l.trim())
              .find((l) => l.startsWith("{"));
            if (firstJsonLine) meta = JSON.parse(firstJsonLine);
          } catch {
            // Keep going with URL/title fallback.
          }

          const downloadResult = await runYtDlp(
            [
              "--no-playlist",
              "--merge-output-format",
              "mp4",
              "-f",
              "bestvideo+bestaudio/best",
              "-o",
              outputTemplate,
              "--print",
              "after_move:filepath",
              videoUrl,
            ],
            timeout
          );
          if (downloadResult.exitCode !== 0) {
            return JSON.stringify({
              ok: false,
              step: "download",
              error: (downloadResult.stderr || downloadResult.stdout || "yt-dlp download failed").slice(-4000),
            });
          }

          const downloadedPath =
            downloadResult.stdout
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean)
              .pop() || "";
          if (!downloadedPath) {
            return JSON.stringify({
              ok: false,
              step: "download",
              error: "Could not determine downloaded file path from yt-dlp output.",
            });
          }

          // Convert .webm to .mp4 with ffmpeg (stream-copy first; re-encode if that fails)
          let finalPath = downloadedPath;
          if (extname(downloadedPath).toLowerCase() === ".webm") {
            const mp4Path = downloadedPath.replace(/\.webm$/i, ".mp4");

            // Try fast stream-copy first (preserves quality, no re-encode)
            let convert = await runProcess(
              "ffmpeg",
              ["-i", downloadedPath, "-c:v", "copy", "-c:a", "aac", "-y", mp4Path],
              { timeoutSeconds: Math.min(timeout, 600) }
            );

            // If stream-copy failed (codec incompatible), re-encode to H.264/AAC
            if (convert.exitCode !== 0) {
              convert = await runProcess(
                "ffmpeg",
                ["-i", downloadedPath, "-c:v", "libx264", "-crf", "23", "-preset", "fast",
                 "-c:a", "aac", "-b:a", "128k", "-y", mp4Path],
                { timeoutSeconds: Math.min(timeout, 1800) }
              );
            }

            if (convert.exitCode === 0) {
              await unlink(downloadedPath).catch(() => {});
              finalPath = mp4Path;
            }
          }

          const finalTitle = (title?.trim() || meta.title || videoUrl).slice(0, 400);
          const durationSeconds = Number(meta.duration || 0);
          const duration = durationSeconds > 0
            ? `${Math.floor(durationSeconds / 60)}:${String(Math.floor(durationSeconds % 60)).padStart(2, "0")}`
            : null;
          const video = await upsertVideoRecord({
            url: videoUrl,
            title: finalTitle,
            thumbnail: meta.thumbnail || null,
            duration,
            description: null,
            tags: [],
            pornstars: [],
          });

          const dest = await saveVideoFileToDownloads(video.id, finalPath, ".mp4");

          // Generate thumbnail preview video (non-fatal if it fails).
          let previewFile: string | null = null;
          if (durationSeconds >= 5) {
            try {
              const tmpPreview = join(process.cwd(), "library", "assistant-recordings", `${video.id}-thumb.mp4`);
              const ok = await makeThumbnailVideo(finalPath, tmpPreview, timeout);
              if (ok) {
                previewFile = await saveThumbnailToDownloads(video.id, tmpPreview);
                await unlink(tmpPreview).catch(() => {});
              }
            } catch {
              // Preview generation failure must never break the main download.
            }
          }

          return JSON.stringify({
            ok: true,
            videoId: video.id,
            title: finalTitle,
            sourceUrl: videoUrl,
            file: dest,
            previewFile,
            homepage: "http://localhost:3000/",
          });
        } catch (e) {
          return JSON.stringify({
            ok: false,
            error: (e as Error).message || "downloadAndSaveVideo failed",
          });
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
