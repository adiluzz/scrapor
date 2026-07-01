import { browserRecordVideo } from "@/lib/browser-agent";
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "recordVideo",
  description: "Stop and save recorded WebM video.",
  createTool: () =>
    tool({
      description: "Stop recording and save WebM. Call after wait(fullDuration). Returns saved file path.",
      inputSchema: z.object({ url: z.string().optional() }),
      execute: async ({ url }) => browserRecordVideo(url),
    }),
} satisfies AssistantToolModule;

export default assistantTool;
