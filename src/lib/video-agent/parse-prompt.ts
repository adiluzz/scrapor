import { APICallError } from "@ai-sdk/provider";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { getBedrockProvider } from "@/lib/bedrock";
import { logger } from "@/lib/logger";
import {
  DEFAULT_VIDEO_AGENT_MODEL,
  resolvePromptParseBedrockInferenceId,
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

const PARSE_INSTRUCTIONS = `You configure a video analysis agent. The user describes what to search for in a video catalog and what on-screen events to detect.

Return JSON only with:
- searchQuery: concise search terms for our video API (title/tags/pornstars)
- extractTargets: list of distinct events to locate (e.g. "piss drinking", "piss swallowing"). Each must be a specific visible action with continuous motion in live video footage.
- reasoning: optional short note

Never propose extractTargets for ads, sponsor cards, interstitials, still images, posters, thumbnails, title cards, or static screens. Small corner watermarks are OK to ignore.`;

function buildPrompt(userPrompt: string): string {
  return `${PARSE_INSTRUCTIONS}

User prompt:
"""
${userPrompt}
"""`;
}

function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON object");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function formatBedrockError(err: unknown): string {
  if (err instanceof APICallError) {
    const body =
      typeof err.responseBody === "string"
        ? err.responseBody
        : err.responseBody != null
          ? JSON.stringify(err.responseBody)
          : "";
    const detail = body ? ` — ${body.slice(0, 400)}` : "";
    return `${err.message} (HTTP ${err.statusCode ?? "?"})${detail}`;
  }
  if (err instanceof Error) return err.message;
  return "Prompt parsing failed";
}

async function parseWithGenerateText(
  bedrockModelId: string,
  userPrompt: string
): Promise<ParsedAgentPrompt> {
  const bedrock = getBedrockProvider();
  const { text } = await generateText({
    model: bedrock(bedrockModelId),
    prompt: `${buildPrompt(userPrompt)}

Respond with ONLY a single JSON object. No markdown fences or commentary.`,
  });

  const parsed = parseSchema.safeParse(extractJsonObject(text));
  if (!parsed.success) {
    throw new Error(`Invalid JSON from model: ${parsed.error.message}`);
  }
  return parsed.data;
}

async function parseWithGenerateObject(
  bedrockModelId: string,
  userPrompt: string
): Promise<ParsedAgentPrompt> {
  const bedrock = getBedrockProvider();
  const { object } = await generateObject({
    model: bedrock(bedrockModelId),
    schema: parseSchema,
    prompt: buildPrompt(userPrompt),
  });
  return object;
}

/** Parse agent prompt using a text-capable Bedrock model (Nova 2 Lite by default). */
export async function parseUserPrompt(
  userPrompt: string,
  analysisModelId: string = DEFAULT_VIDEO_AGENT_MODEL
): Promise<ParsedAgentPrompt> {
  const model = resolveVideoAgentModel(analysisModelId);
  if (!model) {
    throw new Error("Invalid analysis model");
  }

  const bedrockModelId = resolvePromptParseBedrockInferenceId(analysisModelId);
  logger.info(
    { analysisModelId, bedrockModelId },
    "video-agent parse prompt"
  );

  try {
    return await parseWithGenerateObject(bedrockModelId, userPrompt);
  } catch (objectErr) {
    logger.warn(
      { err: objectErr, bedrockModelId },
      "video-agent generateObject failed, falling back to generateText"
    );
    try {
      return await parseWithGenerateText(bedrockModelId, userPrompt);
    } catch (textErr) {
      throw new Error(formatBedrockError(textErr));
    }
  }
}
