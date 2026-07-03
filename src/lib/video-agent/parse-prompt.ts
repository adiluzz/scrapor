import { generateObject } from "ai";
import { z } from "zod";
import { getBedrockProvider } from "@/lib/bedrock";
import {
  DEFAULT_VIDEO_AGENT_MODEL,
  resolveAgentBedrockInferenceId,
  resolveVideoAgentModel,
} from "@/lib/video-agent-models";

const parseSchema = z.object({
  searchQuery: z.string().describe("Terms to search the video catalog API"),
  extractTargets: z
    .array(z.string())
    .min(1)
    .describe("Specific on-screen events to detect with timestamps and screen regions"),
  reasoning: z.string().optional(),
});

export type ParsedAgentPrompt = z.infer<typeof parseSchema>;

/** Parse agent prompt using the same Bedrock model the admin selected for analysis. */
export async function parseUserPrompt(
  userPrompt: string,
  analysisModelId: string = DEFAULT_VIDEO_AGENT_MODEL
): Promise<ParsedAgentPrompt> {
  const model = resolveVideoAgentModel(analysisModelId);
  if (!model) {
    throw new Error("Invalid analysis model");
  }

  const bedrockModelId = resolveAgentBedrockInferenceId(analysisModelId);
  const bedrock = getBedrockProvider();

  const { object } = await generateObject({
    model: bedrock(bedrockModelId),
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
