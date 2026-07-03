import { resolveBedrockInferenceModelId } from "@/lib/bedrock-inference";

export type VideoAgentModelId =
  | "pegasus-1-5"
  | "pegasus-1-2"
  | "nova-2-lite"
  | "nova-pro"
  | "nova-lite"
  | "nova-premier";

export type VideoAgentModelInfo = {
  id: VideoAgentModelId;
  label: string;
  provider: string;
  description: string;
  supportsBbox: boolean;
  costTier: "$" | "$$" | "$$$";
  /** Approx. USD per hour of source video (2 detection targets, 3-min chunks). */
  pricePerHourApprox: string;
  /** Foundation model ID (resolved to geo inference profile at call time). */
  bedrockModelId?: string;
  /** When true, hidden from the default picker unless explicitly allowlisted. */
  deprecated?: boolean;
  /** Recommended replacement model id. */
  successor?: VideoAgentModelId;
  lifecycle?: "active" | "legacy" | "eol";
};

export const VIDEO_AGENT_MODEL_CATALOG: VideoAgentModelInfo[] = [
  {
    id: "pegasus-1-5",
    label: "Pegasus 1.5 (segmentation)",
    provider: "TwelveLabs direct",
    description:
      "Best for structured event detection with native timestamped segments. Requires TWELVELABS_API_KEY (not Bedrock).",
    supportsBbox: false,
    costTier: "$$$",
    pricePerHourApprox: "~$3.50/hr",
    lifecycle: "active",
  },
  {
    id: "pegasus-1-2",
    label: "Pegasus 1.2 (Bedrock)",
    provider: "Amazon Bedrock",
    description:
      "TwelveLabs video understanding on Bedrock. Active — uses inference profile twelvelabs.pegasus-1-2-v1:0.",
    supportsBbox: false,
    costTier: "$$",
    pricePerHourApprox: "~$2/hr",
    bedrockModelId: "twelvelabs.pegasus-1-2-v1:0",
    lifecycle: "active",
  },
  {
    id: "nova-2-lite",
    label: "Nova 2 Lite (recommended)",
    provider: "Amazon Bedrock",
    description:
      "Current-generation Nova with native video input, timestamps, and bounding boxes. Replaces Nova 1 Lite/Pro.",
    supportsBbox: true,
    costTier: "$",
    pricePerHourApprox: "~$0.40/hr",
    bedrockModelId: "amazon.nova-2-lite-v1:0",
    lifecycle: "active",
  },
  {
    id: "nova-lite",
    label: "Nova Lite (Nova 1 — deprecated)",
    provider: "Amazon Bedrock",
    description:
      "Legacy Nova 1 model. Migrate to Nova 2 Lite — Nova 1 may return 'end of life' errors on some accounts.",
    supportsBbox: true,
    costTier: "$",
    pricePerHourApprox: "~$0.10/hr",
    bedrockModelId: "amazon.nova-lite-v1:0",
    deprecated: true,
    successor: "nova-2-lite",
    lifecycle: "legacy",
  },
  {
    id: "nova-pro",
    label: "Nova Pro (Nova 1 — deprecated)",
    provider: "Amazon Bedrock",
    description: "Legacy Nova 1 Pro. Use Nova 2 Lite instead for video analysis.",
    supportsBbox: true,
    costTier: "$$",
    pricePerHourApprox: "~$1/hr",
    bedrockModelId: "amazon.nova-pro-v1:0",
    deprecated: true,
    successor: "nova-2-lite",
    lifecycle: "legacy",
  },
  {
    id: "nova-premier",
    label: "Nova Premier (Legacy — EOL Sep 2026)",
    provider: "Amazon Bedrock",
    description: "Nova 1 Premier is Legacy with EOL 2026-09-14. Use Nova 2 Lite.",
    supportsBbox: true,
    costTier: "$$$",
    pricePerHourApprox: "~$4/hr",
    bedrockModelId: "amazon.nova-premier-v1:0",
    deprecated: true,
    successor: "nova-2-lite",
    lifecycle: "legacy",
  },
];

const DEFAULT_ALLOWLIST = "pegasus-1-5,pegasus-1-2,nova-2-lite";

export function listVideoAgentModels(): VideoAgentModelInfo[] {
  const raw = process.env.VIDEO_AGENT_MODELS || DEFAULT_ALLOWLIST;
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return VIDEO_AGENT_MODEL_CATALOG.filter((m) => allowed.has(m.id));
}

export function resolveVideoAgentModel(id: string): VideoAgentModelInfo | null {
  return listVideoAgentModels().find((m) => m.id === id) ?? null;
}

export const DEFAULT_VIDEO_AGENT_MODEL: VideoAgentModelId = "nova-2-lite";

/** Foundation model used to parse prompts (text-only; never Pegasus). */
export const PROMPT_PARSE_BEDROCK_MODEL = "amazon.nova-2-lite-v1:0";

/**
 * Bedrock model for Step 1 prompt parsing.
 * Pegasus models are video-only on Bedrock and cannot run text JSON extraction.
 */
export function resolvePromptParseBedrockInferenceId(analysisModelId: string): string {
  const model = resolveVideoAgentModel(analysisModelId);
  if (model?.bedrockModelId?.startsWith("amazon.")) {
    return resolveBedrockInferenceModelId(model.bedrockModelId);
  }
  return resolveBedrockInferenceModelId(PROMPT_PARSE_BEDROCK_MODEL);
}

/** Bedrock inference profile ID for the admin-selected video agent model. */
export function resolveAgentBedrockInferenceId(analysisModelId: string): string {
  const model = resolveVideoAgentModel(analysisModelId);
  if (!model) {
    throw new Error("Invalid analysis model");
  }
  if (!model.bedrockModelId) {
    throw new Error(
      `${model.label} uses the TwelveLabs direct API for video analysis and cannot parse prompts on Bedrock. Choose Nova 2 Lite or Pegasus 1.2 (Bedrock).`
    );
  }
  return resolveBedrockInferenceModelId(model.bedrockModelId);
}
