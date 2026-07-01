import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { normalizeLibraryImagePath } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "returnImage",
  description: "Return a library image back to the user in chat.",
  createTool: () =>
    tool({
      description:
        "Return an image to the user by path. Path must be inside library/ and point to png/jpg/jpeg/webp/gif.",
      inputSchema: z.object({
        path: z.string(),
        caption: z.string().optional(),
      }),
      execute: async ({ path, caption }) => {
        const normalized = normalizeLibraryImagePath(path);
        return caption?.trim()
          ? `IMAGE: ${normalized}\nCAPTION: ${caption.trim()}`
          : `IMAGE: ${normalized}`;
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
