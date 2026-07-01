import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { join, mkdir, runProcess } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "downloadVideoFile",
  description:
    "Download a video from any URL (using yt-dlp) to the local recordings folder. Returns the local file path and basic yt-dlp metadata. Does NOT create a database record — call saveVideoRecord afterward to register the video in the app.",
  createTool: () =>
    tool({
      description:
        "Download a video by URL using yt-dlp and save it to library/assistant-recordings/. " +
        "Returns the local file path and yt-dlp metadata (title, duration, thumbnail, description, tags). " +
        "This is step 1 of 2: call saveVideoRecord next to register the video in the app with full metadata.",
      inputSchema: z.object({
        videoUrl: z
          .string()
          .describe("The video page URL (not a direct stream URL). yt-dlp resolves the stream internally."),
        timeoutSeconds: z
          .number()
          .min(30)
          .max(7200)
          .optional()
          .describe("Max download time in seconds. Defaults to 1800 (30 min)."),
      }),
      execute: async ({ videoUrl, timeoutSeconds }) => {
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
          const stem = `dl-${Date.now()}`;
          const outputTemplate = join(recordingsDir, `${stem}.%(ext)s`);
          const timeout = timeoutSeconds ?? 1800;

          // Step 1: extract metadata only (fast)
          const metaResult = await runYtDlp(
            ["--no-playlist", "--dump-single-json", videoUrl],
            Math.min(timeout, 300)
          );
          let ytMeta: {
            title?: string;
            duration?: number;
            thumbnail?: string;
            description?: string;
            tags?: string[];
          } = {};
          if (metaResult.exitCode === 0 && metaResult.stdout.trim()) {
            try {
              const firstJson = metaResult.stdout
                .split("\n")
                .map((l) => l.trim())
                .find((l) => l.startsWith("{"));
              if (firstJson) ytMeta = JSON.parse(firstJson);
            } catch {
              // keep empty
            }
          }

          // Step 2: download the file
          const downloadResult = await runYtDlp(
            [
              "--no-playlist",
              "--merge-output-format", "mp4",
              "-f", "bestvideo+bestaudio/best",
              "-o", outputTemplate,
              "--print", "after_move:filepath",
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

          // Convert .webm → .mp4 if needed
          let finalPath = downloadedPath;
          if (downloadedPath.toLowerCase().endsWith(".webm")) {
            const mp4Path = downloadedPath.replace(/\.webm$/i, ".mp4");
            let convert = await runProcess(
              "ffmpeg",
              ["-i", downloadedPath, "-c:v", "copy", "-c:a", "aac", "-y", mp4Path],
              { timeoutSeconds: Math.min(timeout, 600) }
            );
            if (convert.exitCode !== 0) {
              convert = await runProcess(
                "ffmpeg",
                ["-i", downloadedPath, "-c:v", "libx264", "-crf", "23", "-preset", "fast",
                 "-c:a", "aac", "-b:a", "128k", "-y", mp4Path],
                { timeoutSeconds: Math.min(timeout, 1800) }
              );
            }
            if (convert.exitCode === 0) {
              try { const { unlink } = await import("fs/promises"); await unlink(downloadedPath); } catch {}
              finalPath = mp4Path;
            }
          }

          const durationSeconds = Number(ytMeta.duration || 0);
          const durationFormatted =
            durationSeconds > 0
              ? `${Math.floor(durationSeconds / 60)}:${String(Math.floor(durationSeconds % 60)).padStart(2, "0")}`
              : null;

          return JSON.stringify({
            ok: true,
            localPath: finalPath,
            ytMeta: {
              title: ytMeta.title || "",
              duration: durationFormatted,
              durationSeconds,
              thumbnail: ytMeta.thumbnail || "",
              description: ytMeta.description || "",
              tags: Array.isArray(ytMeta.tags) ? ytMeta.tags : [],
            },
            note: "File downloaded. Call saveVideoRecord with localPath and full metadata to register it in the app.",
          });
        } catch (e) {
          return JSON.stringify({
            ok: false,
            error: (e as Error).message || "downloadVideoFile failed",
          });
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
