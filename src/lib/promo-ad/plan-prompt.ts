import { generateObject } from "ai";
import { z } from "zod";
import { getBedrockProvider } from "@/lib/bedrock";
import { resolveBedrockInferenceModelId } from "@/lib/bedrock-inference";
import { PROMPT_PARSE_BEDROCK_MODEL } from "@/lib/video-agent-models";

const planSchema = z.object({
  prompt: z
    .string()
    .max(4000)
    .describe("Nova Reel / generative video prompt (English, cinematic ad copy)"),
  shotSummary: z.string().describe("Brief bullet summary of shots"),
  ctaText: z.string().describe("Call-to-action tagline for end card"),
  durationSeconds: z.number().min(6).max(120).describe("Recommended ad duration in seconds"),
});

export type PromoAdPlan = z.infer<typeof planSchema>;

export type PlanPromptInput = {
  clipLabels: string[];
  showcaseVideoTitle?: string;
  userNotes?: string;
  priorPrompt?: string;
  userFeedback?: string;
  brandName?: string;
  brandDomain?: string;
};

function buildPlanPrompt(input: PlanPromptInput): string {
  const clips =
    input.clipLabels.length > 0
      ? input.clipLabels.map((l, i) => `${i + 1}. ${l}`).join("\n")
      : "(no clips selected)";

  let revision = "";
  if (input.priorPrompt && input.userFeedback) {
    revision = `
Revise the prior ad prompt using this feedback:
Prior prompt: """${input.priorPrompt}"""
User feedback: """${input.userFeedback}"""
`;
  }

  const brand = input.brandName || "the site";
  const domain = input.brandDomain || "the site";

  return `You are a promo ad creative director for ${brand} (adult video site). Draft a generative video ad concept.

Brand: ${brand} — premium adult content. Logo appears in intro/outro via post-production (do not describe exact logo pixels).

Approved source clips (for thematic reference):
${clips}

Showcase video: ${input.showcaseVideoTitle || "not specified"}
${input.userNotes ? `Notes: ${input.userNotes}` : ""}
${revision}

Return JSON with:
- prompt: English cinematic ad prompt for AI video generation (≤4000 chars). Mention mood, pacing, premium feel.
- shotSummary: 2-4 sentence shot breakdown
- ctaText: short CTA (e.g. "Stream now at ${domain}")
- durationSeconds: 6–120 (use 6s increments for Nova Reel; prefer 12–30s for social ads)`;
}

export async function planPromoAdPrompt(input: PlanPromptInput): Promise<PromoAdPlan> {
  const bedrock = getBedrockProvider();
  const modelId = resolveBedrockInferenceModelId(PROMPT_PARSE_BEDROCK_MODEL);
  const { object } = await generateObject({
    model: bedrock(modelId),
    schema: planSchema,
    prompt: buildPlanPrompt(input),
  });
  return object;
}
