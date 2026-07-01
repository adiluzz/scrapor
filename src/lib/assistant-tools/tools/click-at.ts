import { browserClickAt } from "@/lib/browser-agent";
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "clickAt",
  description: "Click specific x/y pixel coordinates from screenshot guidance.",
  createTool: () =>
    tool({
      description: "Click at x,y pixel coordinates",
      parameters: z.object({ x: z.number(), y: z.number() }),
      execute: async ({ x, y }) => browserClickAt(x, y),
    }),
} satisfies AssistantToolModule;

export default assistantTool;
