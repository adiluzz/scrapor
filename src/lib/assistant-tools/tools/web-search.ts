import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { decodeHtmlEntities, stripHtml } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "webSearch",
  description: "Search the web and return top relevant links.",
  createTool: () =>
    tool({
      description: "Search the web quickly and return top results (title + URL).",
      parameters: z.object({
        query: z.string(),
        maxResults: z.number().min(1).max(10).optional(),
      }),
      execute: async ({ query, maxResults }) => {
        const limit = maxResults ?? 5;
        const endpoint = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(endpoint, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          cache: "no-store",
        });
        const html = await response.text();
        const matches = Array.from(
          html.matchAll(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
        )
          .slice(0, limit)
          .map((m, idx) => {
            const url = decodeHtmlEntities(m[1] || "");
            const title = stripHtml(m[2] || "");
            return { rank: idx + 1, title, url };
          })
          .filter((r) => r.url && r.title);
        return JSON.stringify({
          query,
          count: matches.length,
          results: matches,
        });
      },
    }),
} satisfies AssistantToolModule;

export default assistantTool;
