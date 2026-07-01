import { browserEvaluateJS } from "@/lib/browser-agent";
import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "evaluateJS",
  description: "Run JavaScript in the page and return the result.",
  createTool: () =>
    tool({
      description: "Run JavaScript in the page. Use 'return' to return a value.",
      inputSchema: z.object({ script: z.string() }),
      execute: async ({ script }) => browserEvaluateJS(script),
    }),
} satisfies AssistantToolModule;

export default assistantTool;
