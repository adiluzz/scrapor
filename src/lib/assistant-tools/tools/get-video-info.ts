import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { execAsync } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "getVideoInfo",
  description: "Get duration and resolution metadata for a video file.",
  createTool: () =>
    tool({
      description: "Get video file duration and resolution using ffprobe.",
      parameters: z.object({ filePath: z.string() }),
      execute: async ({ filePath }) => {
        try {
          const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -show_entries stream=width,height,codec_name -of json "${filePath}"`
          );
          const info = JSON.parse(stdout);
          const duration = parseFloat(info.format?.duration || "0");
          const stream = (info.streams || []).find((s: { codec_type?: string }) => s.codec_type === "video") || info.streams?.[0] || {};
          return JSON.stringify({
            filePath,
            durationSeconds: duration,
            durationFormatted: `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, "0")}`,
            width: stream.width,
            height: stream.height,
            codec: stream.codec_name,
          });
        } catch (e) {
          return `getVideoInfo failed: ${(e as Error).message}`;
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
