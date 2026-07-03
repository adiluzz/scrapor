/** Resolve Bedrock inference profile IDs from foundation model IDs + region. */

export type BedrockGeoPrefix = "us" | "eu" | "jp" | "apac";

export function bedrockGeoPrefix(region: string): BedrockGeoPrefix {
  const r = region.toLowerCase();
  if (r.startsWith("eu-")) return "eu";
  if (r.startsWith("ap-northeast")) return "jp";
  if (r.startsWith("ap-")) return "apac";
  return "us";
}

/** True when the ID is already an inference profile (geo/global prefix). */
export function isInferenceProfileId(modelId: string): boolean {
  return /^(us|eu|jp|apac|global)\./.test(modelId.trim());
}

/**
 * Map a foundation model ID to the geo inference profile ID for the given region.
 * Bedrock video models (Nova, TwelveLabs) should be called via inference profiles in 2026.
 */
export function resolveBedrockInferenceModelId(
  modelId: string,
  region = process.env.AWS_REGION || "us-east-1"
): string {
  const trimmed = modelId.trim();
  if (!trimmed) return trimmed;
  if (isInferenceProfileId(trimmed)) return trimmed;

  const prefix = bedrockGeoPrefix(region);
  if (trimmed.startsWith("amazon.") || trimmed.startsWith("twelvelabs.")) {
    return `${prefix}.${trimmed}`;
  }
  if (trimmed.startsWith("anthropic.")) {
    return `${prefix}.${trimmed}`;
  }
  return trimmed;
}

/** Active default for text/JSON tasks (prompt parsing, assistant). */
export const DEFAULT_BEDROCK_TEXT_MODEL =
  "anthropic.claude-haiku-4-5-20251001-v1:0";
