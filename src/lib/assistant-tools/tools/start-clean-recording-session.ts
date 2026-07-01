import { browserStartCleanRecordingSession } from "@/lib/browser-agent";
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "startCleanRecordingSession",
  description: "Start a new browser video recording session.",
  createTool: () =>
    tool({
      description: "Start browser recording on the video page URL. Call before playing the video.",
      parameters: z.object({ url: z.string() }),
      execute: async ({ url }) => browserStartCleanRecordingSession(url),
    }),
} satisfies AssistantToolModule;

export default assistantTool;
