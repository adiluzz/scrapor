import type { AssistantToolModule } from "@/lib/assistant-tools/types";
import { crawlPageWithCrawl4Ai } from "@/lib/assistant-tools/utils";
import { tool } from "ai";
import { z } from "zod";

const assistantTool = {
  key: "crawlPage",
  description:
    "Use Crawl4AI to quickly crawl one URL and extract clean markdown, metadata, and links for data scraping.",
  createTool: () =>
    tool({
      description:
        "Use Crawl4AI to load one URL and extract page content quickly as clean markdown plus optional metadata and links. Best for reading articles, listings, profiles, product pages, search-result pages, and scraping data from a page without manual browser clicks. Provide a clear extractionGoal so the returned content can be focused on the user's requested data; use cssSelector only when a known section/listing container should be isolated.",
      parameters: z.object({
        url: z.string().url().describe("The absolute http(s) URL to crawl and extract."),
        extractionGoal: z
          .string()
          .optional()
          .describe("Short statement of the exact data to extract, e.g. titles and prices, article text, profile fields, video URLs."),
        cssSelector: z
          .string()
          .optional()
          .describe("Optional CSS selector to restrict extraction to a specific page region or repeated item container."),
        maxChars: z
          .number()
          .min(1000)
          .max(50000)
          .optional()
          .describe("Maximum characters of extracted content to return. Defaults to 12000."),
        includeLinks: z
          .boolean()
          .optional()
          .describe("Whether to include Crawl4AI's extracted internal/external links. Defaults to true."),
        includeMetadata: z
          .boolean()
          .optional()
          .describe("Whether to include page metadata such as title and description. Defaults to true."),
        timeoutSeconds: z
          .number()
          .min(10)
          .max(300)
          .optional()
          .describe("Maximum crawl runtime in seconds. Defaults to 120."),
      }),
      execute: async ({
        url,
        extractionGoal,
        cssSelector,
        maxChars,
        includeLinks,
        includeMetadata,
        timeoutSeconds,
      }) =>
        crawlPageWithCrawl4Ai({
          url,
          extractionGoal,
          cssSelector,
          maxChars,
          includeLinks,
          includeMetadata,
          timeoutSeconds,
        }),
    }),
} satisfies AssistantToolModule;

export default assistantTool;
