import { browserPress } from "@/lib/browser-agent";
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "press",
  description: "Press a keyboard key in the current page.",
  createTool: () =>
    tool({
      description: "Press keyboard key (e.g. Space, f, Escape, Enter)",
      inputSchema: z.object({ key: z.string() }),
      execute: async ({ key }) => browserPress(key),
    }),
} satisfies AssistantToolModule;

export default assistantTool;
