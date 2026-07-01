import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { basename, dirname, execAsync, join } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "trimVideo",
  description: "Trim beginning of video to remove ad/intro.",
  createTool: () =>
    tool({
      description: "Remove ad seconds from beginning of recording. Returns trimmed file path.",
      parameters: z.object({
        filePath: z.string(),
        startSeconds: z.number(),
      }),
      execute: async ({ filePath, startSeconds }) => {
        try {
          const dir = dirname(filePath);
          const base = basename(filePath, ".webm");
          const outPath = join(dir, `${base}-trimmed.webm`);
          await execAsync(`ffmpeg -y -ss ${startSeconds} -i "${filePath}" -c copy "${outPath}"`);
          return `Trimmed video saved to: ${outPath}`;
        } catch (e) {
          return `trimVideo failed: ${(e as Error).message}`;
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
