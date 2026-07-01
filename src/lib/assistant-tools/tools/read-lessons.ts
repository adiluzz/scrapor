import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { LESSONS_FILE } from "@/lib/assistant-tools/utils";
import { jsonSchema, tool } from "ai";

const assistantTool = {
  key: "readLessons",
  description: "Read learned scraping lessons from storage.",
  createTool: () =>
    tool({
      description: "Read prior scraping lessons/notes. Call at the start of every session.",
      parameters: jsonSchema({ type: "object", properties: {} }),
      execute: async () => {
        try {
          const { readFile } = await import("fs/promises");
          const text = await readFile(LESSONS_FILE, "utf-8");
          return text.trim() || "(no lessons yet)";
        } catch {
          return "(no lessons yet)";
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
