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
  bedrockModelId?: string;
};

export const VIDEO_AGENT_MODEL_CATALOG: VideoAgentModelInfo[] = [
  {
    id: "pegasus-1-5",
    label: "Pegasus 1.5 (segmentation)",
    provider: "TwelveLabs direct",
    description:
      "Best for structured event detection with native timestamped segments. Requires TWELVELABS_API_KEY.",
    supportsBbox: false,
    costTier: "$$$",
    pricePerHourApprox: "~$3.50/hr",
  },
  {
    id: "pegasus-1-2",
    label: "Pegasus 1.2 (Bedrock)",
    provider: "Amazon Bedrock",
    description: "Strong temporal grounding via Bedrock InvokeModel with JSON schema output.",
    supportsBbox: false,
    costTier: "$$",
    pricePerHourApprox: "~$2/hr",
    bedrockModelId: "us.twelvelabs.pegasus-1-2-v1:0",
  },
  {
    id: "nova-2-lite",
    label: "Nova 2 Lite",
    provider: "Amazon Bedrock",
    description: "Cost-efficient native video analysis with timestamps and bounding boxes.",
    supportsBbox: true,
    costTier: "$",
    pricePerHourApprox: "~$0.40/hr",
    bedrockModelId: "amazon.nova-2-lite-v1:0",
  },
  {
    id: "nova-pro",
    label: "Nova Pro",
    provider: "Amazon Bedrock",
    description: "Higher-accuracy Nova multimodal video understanding.",
    supportsBbox: true,
    costTier: "$$",
    pricePerHourApprox: "~$1/hr",
    bedrockModelId: "amazon.nova-pro-v1:0",
  },
  {
    id: "nova-lite",
    label: "Nova Lite",
    provider: "Amazon Bedrock",
    description: "Fast, low-cost Nova video analysis.",
    supportsBbox: true,
    costTier: "$",
    pricePerHourApprox: "~$0.10/hr",
    bedrockModelId: "amazon.nova-lite-v1:0",
  },
  {
    id: "nova-premier",
    label: "Nova Premier",
    provider: "Amazon Bedrock",
    description: "Highest Nova 1 accuracy (legacy, EOL Sep 2026).",
    supportsBbox: true,
    costTier: "$$$",
    pricePerHourApprox: "~$4/hr",
    bedrockModelId: "amazon.nova-premier-v1:0",
  },
];

const DEFAULT_ALLOWLIST =
  "pegasus-1-5,pegasus-1-2,nova-2-lite,nova-pro,nova-lite,nova-premier";

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

export const DEFAULT_VIDEO_AGENT_MODEL: VideoAgentModelId = "pegasus-1-5";
