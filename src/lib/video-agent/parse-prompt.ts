import { generateObject } from "ai";
import { z } from "zod";
import { DEFAULT_BEDROCK_TEXT_MODEL } from "@/lib/bedrock-inference";
import { getBedrockProvider } from "@/lib/bedrock";

const parseSchema = z.object({
  searchQuery: z.string().describe("Terms to search the video catalog API"),
  extractTargets: z
    .array(z.string())
    .min(1)
    .describe("Specific on-screen events to detect with timestamps and screen regions"),
  reasoning: z.string().optional(),
});

export type ParsedAgentPrompt = z.infer<typeof parseSchema>;

/** Parse agent prompt with a fixed cheap text model (not the user's video analysis pick). */
export async function parseUserPrompt(userPrompt: string): Promise<ParsedAgentPrompt> {
  const bedrock = getBedrockProvider();

  const { object } = await generateObject({
    model: bedrock(DEFAULT_BEDROCK_TEXT_MODEL),
    schema: parseSchema,
    prompt: `You configure a video analysis agent. The user describes what to search for in a video catalog and what on-screen events to detect.

User prompt:
"""
${userPrompt}
"""

Return:
- searchQuery: concise search terms for our video API (title/tags/pornstars)
- extractTargets: list of distinct events to locate (e.g. "piss drinking", "piss swallowing"). Each must be a specific visible action.`,
  });

  return object;
}
