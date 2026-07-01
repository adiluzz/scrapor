import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { join, LESSONS_FILE, mkdir } from "@/lib/assistant-tools/utils";
import { writeFile } from "fs/promises";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "updateLessons",
  description: "Replace the entire lessons file with new curated content — use to remove outdated lessons and rewrite with clean, accurate ones.",
  createTool: () =>
    tool({
      description:
        "Completely replace the scraping lessons file with new content. Use to remove bad/outdated lessons and rewrite with only accurate ones. IMPORTANT: call this tool IMMEDIATELY — do NOT print the content as text first. Just call the tool directly with the new content.",
      parameters: z.object({
        content: z.string().min(1).describe("The full new content for the lessons file in markdown."),
      }),
      execute: async ({ content }) => {
        try {
          await mkdir(join(process.cwd(), "library"), { recursive: true });
          await writeFile(LESSONS_FILE, content.trim() + "\n", "utf-8");
          return "Lessons file replaced successfully.";
        } catch (e) {
          return `updateLessons failed: ${(e as Error).message}`;
        }
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
