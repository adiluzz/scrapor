import { generateObject } from "ai";
import { z } from "zod";
import { getBedrockProvider, resolveBedrockModelId } from "@/lib/bedrock";
import { loadAssistantSettings } from "@/lib/assistant-settings";

const parseSchema = z.object({
  searchQuery: z.string().describe("Terms to search the video catalog API"),
  extractTargets: z
    .array(z.string())
    .min(1)
    .describe("Specific on-screen events to detect with timestamps and screen regions"),
  reasoning: z.string().optional(),
});

export type ParsedAgentPrompt = z.infer<typeof parseSchema>;

export async function parseUserPrompt(userPrompt: string): Promise<ParsedAgentPrompt> {
  const settings = await loadAssistantSettings();
  const bedrock = getBedrockProvider();
  const modelId = resolveBedrockModelId(settings.model);

  const { object } = await generateObject({
    model: bedrock(modelId),
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
