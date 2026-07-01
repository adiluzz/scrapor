import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { stripHtml } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "fetchWebPage",
  description: "Fetch and parse text content from a webpage URL.",
  createTool: () =>
    tool({
      description: "Fetch a web page and return clean text content.",
      parameters: z.object({
        url: z.string(),
        maxChars: z.number().min(500).max(50000).optional(),
      }),
      execute: async ({ url, maxChars }) => {
        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          cache: "no-store",
        });
        const html = await response.text();
        const text = stripHtml(html);
        const limit = maxChars ?? 8000;
        return JSON.stringify({
          url,
          status: response.status,
          ok: response.ok,
          content: text.slice(0, limit),
        });
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
