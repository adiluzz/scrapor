import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { saveVideoFileToDownloads, upsertVideoRecord } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "addVideo",
  description: "Save captured video into app DB/downloads for homepage.",
  createTool: () =>
    tool({
      description: "Save video to app database and downloads/ so it appears on the homepage. Call after trimVideo.",
      parameters: z.object({
        url: z.string(),
        title: z.string(),
        recordingPath: z.string(),
        thumbnail: z.string().optional(),
        duration: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        pornstars: z.array(z.string()).optional(),
      }),
      execute: async ({ url, title, recordingPath, thumbnail, duration, description, tags, pornstars }) => {
        try {
          const video = await upsertVideoRecord({
            url,
            title,
            thumbnail,
            duration,
            description,
            tags,
            pornstars,
          });
          const dest = await saveVideoFileToDownloads(video.id, recordingPath, ".webm");
          return `Video "${title}" saved to app.\nDB ID: ${video.id} | Slug: ${video.slug}\nFile: ${dest}\nVisible at http://localhost:3000/`;
        } catch (e) {
          return `addVideo failed: ${(e as Error).message}`;
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
