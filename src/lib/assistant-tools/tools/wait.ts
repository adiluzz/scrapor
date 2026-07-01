import { browserWait } from "@/lib/browser-agent";
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "wait",
  description: "Pause for N seconds between actions.",
  createTool: () =>
    tool({
      description: "Wait N seconds. Use full video duration before recordVideo.",
      inputSchema: z.object({ seconds: z.number().min(0).max(7200) }),
      execute: async ({ seconds }) => browserWait(seconds),
    }),
} satisfies AssistantToolModule;

export default assistantTool;
