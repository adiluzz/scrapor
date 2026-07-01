import { browserNavigate } from "@/lib/browser-agent";
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "navigate",
  description: "Navigate browser to a URL.",
  createTool: () =>
    tool({
      description: "Navigate browser to a URL",
      parameters: z.object({ url: z.string() }),
      execute: async ({ url }) => browserNavigate(url),
    }),
} satisfies AssistantToolModule;

export default assistantTool;
