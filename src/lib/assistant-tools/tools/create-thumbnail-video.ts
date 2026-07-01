import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import {
  join,
  runProcess,
  saveThumbnailToDownloads,
  videoFilePath,
} from "@/lib/assistant-tools/utils";
import { unlink } from "fs/promises";
import { tool } from "ai";
import { z } from "zod";

/**
 * Single-pass thumbnail: select first 5 s of every 60 s block.
 * No temp files — low memory, works for any video length.
 */
async function buildThumbnailVideo(sourcePath: string, destPath: string): Promise<boolean> {
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
    const r = await runProcess("ffmpeg", args, { timeoutSeconds: 1800 });
    return r.exitCode === 0;
  };

  return (await tryRun(true)) || (await tryRun(false));
}

const assistantTool = {
  key: "createThumbnailVideo",
  description:
    "Build a short preview clip for a video already in the app. " +
    "Samples the first 5 s of every minute in a single ffmpeg pass (memory-efficient).",
  createTool: () =>
    tool({
      description:
        "Create a thumbnail preview video for a video already saved in the app. " +
        "Selects the first 5 s of every 60 s block and saves to downloads/{videoId}/thumbnail.mp4.",
      parameters: z.object({
        videoId: z.string().describe("The video's DB id (from the watch page URL)."),
      }),
      execute: async ({ videoId }) => {
        try {
          const source = videoFilePath(videoId);
          const tmp = join(
            process.cwd(),
            "library",
            "assistant-recordings",
            `${videoId}-thumb.mp4`
          );
          const ok = await buildThumbnailVideo(source, tmp);
          if (!ok) return JSON.stringify({ ok: false, error: "ffmpeg failed to build thumbnail" });
          const dest = await saveThumbnailToDownloads(videoId, tmp);
          await unlink(tmp).catch(() => {});
          return JSON.stringify({ ok: true, file: dest });
        } catch (e) {
          return JSON.stringify({ ok: false, error: (e as Error).message });
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
