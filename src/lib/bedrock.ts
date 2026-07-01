import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

const DEFAULT_MODEL = "anthropic.claude-3-5-sonnet-20241022-v2:0";

let _provider: ReturnType<typeof createAmazonBedrock> | null = null;

export function getBedrockProvider() {
  if (!_provider) {
    _provider = createAmazonBedrock({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
  return _provider;
}

/** Resolved model id: saved settings → BEDROCK_MODEL_ID → default Claude Sonnet. */
export function resolveBedrockModelId(settingsModel?: string): string {
  const fromSettings = settingsModel?.trim();
  if (fromSettings) return fromSettings;
  return process.env.BEDROCK_MODEL_ID?.trim() || DEFAULT_MODEL;
}

/** Comma-separated BEDROCK_MODELS env, else single BEDROCK_MODEL_ID, else default. */
export function listBedrockModelIds(): string[] {
  const raw = process.env.BEDROCK_MODELS || process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length ? ids : [DEFAULT_MODEL];
}
