import { browserClick } from "@/lib/browser-agent";
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "click",
  description: "Click an element by CSS selector.",
  createTool: () =>
    tool({
      description: "Click element by CSS selector",
      inputSchema: z.object({ selector: z.string() }),
      execute: async ({ selector }) => browserClick(selector),
    }),
} satisfies AssistantToolModule;

export default assistantTool;
