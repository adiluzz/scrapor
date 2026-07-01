import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { join, LESSONS_FILE, mkdir } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "writeLesson",
  description: "Append a short lesson or finding to the lessons file.",
  createTool: () =>
    tool({
      description:
        "Append a short lesson to the lessons file. IMPORTANT: call this tool IMMEDIATELY — do NOT compose or print the lesson as text first. Write 3-10 bullet points maximum per call. If you have multiple lessons, call this tool multiple times.",
      inputSchema: z.object({ lesson: z.string().describe("Short lesson content, 3-10 bullet points max.") }),
      execute: async ({ lesson }) => {
        try {
          const { appendFile } = await import("fs/promises");
          await mkdir(join(process.cwd(), "library"), { recursive: true });
          const entry = `\n---\n${new Date().toISOString()}\n${lesson.trim()}\n`;
          await appendFile(LESSONS_FILE, entry, "utf-8");
          return "Lesson saved.";
        } catch (e) {
          return `writeLesson failed: ${(e as Error).message}`;
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
