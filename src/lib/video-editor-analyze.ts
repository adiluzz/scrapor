import { parseUserPrompt } from "@/lib/video-agent/parse-prompt";
import { logger } from "@/lib/logger";

/** Concrete visible actions Nova can detect (not abstract slug keys). */
const HIGHLIGHT_TARGET_FALLBACK = [
  "engaging highlight moment",
  "strong visual action peak",
  "compelling on-screen moment",
];

const ABSTRACT_TARGET_KEYS = new Set(["highlight", "best_moment", "action_peak", "best moment"]);

function normalizeTargets(targets: string[]): string[] {
  const cleaned = targets
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !ABSTRACT_TARGET_KEYS.has(t.toLowerCase()));
  return cleaned.length ? cleaned.slice(0, 6) : HIGHLIGHT_TARGET_FALLBACK;
}

/**
 * Derive Bedrock detection targets from the editor prompt.
 * Uses the same parser as Video Agent, with highlight-friendly fallbacks.
 */
export async function resolveEditorExtractTargets(
  userPrompt: string,
  analysisModelId: string,
  targetDurationSec: number
): Promise<string[]> {
  const prompt =
    userPrompt.trim() ||
    `Find the most engaging highlight moments suitable for a ${targetDurationSec}-second promo reel. Prefer clear action peaks and strong visual moments.`;

  try {
    const parsed = await parseUserPrompt(prompt, analysisModelId);
    const targets = normalizeTargets(parsed.extractTargets);
    logger.info({ targets, analysisModelId }, "video-editor extract targets parsed");
    return targets;
  } catch (err) {
    logger.warn({ err }, "video-editor prompt parse failed, using highlight defaults");
    return HIGHLIGHT_TARGET_FALLBACK;
  }
}
