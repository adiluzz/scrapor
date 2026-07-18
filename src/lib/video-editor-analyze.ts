import { parseUserPrompt } from "@/lib/video-agent/parse-prompt";
import { logger } from "@/lib/logger";

/** Concrete visible actions Nova can detect (not abstract slug keys). */
const HIGHLIGHT_TARGET_FALLBACK = [
  "continuous on-screen action with visible motion",
  "dynamic video highlight with moving subjects",
  "engaging action peak in live footage",
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
 * Expects the full prompt from {@link buildEditorAnalysisPrompt} (system + optional user direction).
 */
export async function resolveEditorExtractTargets(
  fullPrompt: string,
  analysisModelId: string
): Promise<string[]> {
  const prompt = fullPrompt.trim();
  if (!prompt) {
    return HIGHLIGHT_TARGET_FALLBACK;
  }

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
