export type PromoAdProvider = "internal" | "bedrock" | "fal" | "runway" | "gemini";

export type PromoAdModelInfo = {
  id: string;
  label: string;
  provider: PromoAdProvider;
  generationMode: "clip_compose" | "generative";
  pricePerSecondUsd: number;
  priceWithAudioUsd?: number;
  maxDurationSec: number;
  resolution: string;
  supportsAudio: boolean;
  supportsImageToVideo: boolean;
  supportsMultiShot: boolean;
  deprecated?: boolean;
  successor?: string;
  pricingSourceUrl: string;
  envKeyRequired?: string;
  description: string;
};

export const PROMO_AD_CATALOG_VERSION = process.env.PROMO_AD_MODEL_CATALOG_VERSION || "2026-07";

export const PROMO_AD_MODEL_CATALOG: PromoAdModelInfo[] = [
  {
    id: "clip-compose",
    label: "Clip Compose (no AI)",
    provider: "internal",
    generationMode: "clip_compose",
    pricePerSecondUsd: 0,
    maxDurationSec: 300,
    resolution: "1080p",
    supportsAudio: false,
    supportsImageToVideo: false,
    supportsMultiShot: false,
    pricingSourceUrl: "",
    description:
      "Stitches approved clips with crossfades, color normalization, optional Ken Burns, per-source watermark removal, and animated Pisster intro/outro. No generative API cost.",
  },
  {
    id: "nova-reel-1-1",
    label: "Nova Reel 1.1",
    provider: "bedrock",
    generationMode: "generative",
    pricePerSecondUsd: 0.08,
    maxDurationSec: 120,
    resolution: "720p",
    supportsAudio: false,
    supportsImageToVideo: true,
    supportsMultiShot: true,
    deprecated: true,
    successor: "kling-3-pro",
    pricingSourceUrl: "https://aws.amazon.com/bedrock/pricing/",
    description: "AWS-native multi-shot video up to 2 minutes. Legacy — EOL Sep 2026.",
  },
  {
    id: "luma-ray-2-540p",
    label: "Luma Ray 2 (540p)",
    provider: "bedrock",
    generationMode: "generative",
    pricePerSecondUsd: 0.75,
    maxDurationSec: 9,
    resolution: "540p",
    supportsAudio: false,
    supportsImageToVideo: false,
    supportsMultiShot: false,
    pricingSourceUrl: "https://aws.amazon.com/bedrock/pricing/",
    description:
      "Short cinematic clips (5 or 9s) via Bedrock in us-west-2. Lower cost tier — good for motion tests.",
  },
  {
    id: "luma-ray-2-720p",
    label: "Luma Ray 2 (720p)",
    provider: "bedrock",
    generationMode: "generative",
    pricePerSecondUsd: 1.5,
    maxDurationSec: 9,
    resolution: "720p",
    supportsAudio: false,
    supportsImageToVideo: false,
    supportsMultiShot: false,
    pricingSourceUrl: "https://aws.amazon.com/bedrock/pricing/",
    description:
      "Higher-fidelity Luma Ray 2 on Bedrock (5 or 9s). Enable model access in us-west-2.",
  },
  {
    id: "kling-3-standard",
    label: "Kling 3.0 Standard",
    provider: "fal",
    generationMode: "generative",
    pricePerSecondUsd: 0.084,
    priceWithAudioUsd: 0.126,
    maxDurationSec: 15,
    resolution: "1080p",
    supportsAudio: true,
    supportsImageToVideo: true,
    supportsMultiShot: true,
    pricingSourceUrl: "https://fal.ai/models/fal-ai/kling-video/v3/standard/text-to-video",
    envKeyRequired: "FAL_API_KEY",
    description: "Best all-around value — multi-shot consistency, 1080p, up to 15s.",
  },
  {
    id: "kling-3-pro",
    label: "Kling 3.0 Pro",
    provider: "fal",
    generationMode: "generative",
    pricePerSecondUsd: 0.112,
    priceWithAudioUsd: 0.168,
    maxDurationSec: 15,
    resolution: "1080p",
    supportsAudio: true,
    supportsImageToVideo: true,
    supportsMultiShot: true,
    pricingSourceUrl: "https://fal.ai/learn/tools/how-to-use-kling-3-0-pro",
    envKeyRequired: "FAL_API_KEY",
    description: "Recommended generative default — structured multi-shot, character consistency.",
  },
  {
    id: "veo-3-1-lite",
    label: "Veo 3.1 Lite",
    provider: "gemini",
    generationMode: "generative",
    pricePerSecondUsd: 0.05,
    maxDurationSec: 8,
    resolution: "720p",
    supportsAudio: true,
    supportsImageToVideo: true,
    supportsMultiShot: false,
    pricingSourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    envKeyRequired: "GEMINI_API_KEY",
    description: "Cheapest Google tier with native audio.",
  },
  {
    id: "veo-3-1-fast",
    label: "Veo 3.1 Fast",
    provider: "gemini",
    generationMode: "generative",
    pricePerSecondUsd: 0.1,
    maxDurationSec: 8,
    resolution: "1080p",
    supportsAudio: true,
    supportsImageToVideo: true,
    supportsMultiShot: false,
    pricingSourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    envKeyRequired: "GEMINI_API_KEY",
    description: "Fast drafts with good quality and lip-sync.",
  },
  {
    id: "veo-3-1-standard",
    label: "Veo 3.1 Standard",
    provider: "gemini",
    generationMode: "generative",
    pricePerSecondUsd: 0.4,
    maxDurationSec: 8,
    resolution: "1080p",
    supportsAudio: true,
    supportsImageToVideo: true,
    supportsMultiShot: false,
    pricingSourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    envKeyRequired: "GEMINI_API_KEY",
    description: "Cinematic hero shots — best lip-sync, premium cost.",
  },
  {
    id: "runway-gen4-turbo",
    label: "Runway Gen-4 Turbo",
    provider: "runway",
    generationMode: "generative",
    pricePerSecondUsd: 0.05,
    maxDurationSec: 10,
    resolution: "1080p",
    supportsAudio: false,
    supportsImageToVideo: true,
    supportsMultiShot: false,
    pricingSourceUrl: "https://docs.dev.runwayml.com/guides/pricing/",
    envKeyRequired: "RUNWAY_API_KEY",
    description: "Fast, affordable iteration for prompt testing.",
  },
  {
    id: "runway-gen4-5",
    label: "Runway Gen-4.5",
    provider: "runway",
    generationMode: "generative",
    pricePerSecondUsd: 0.12,
    maxDurationSec: 10,
    resolution: "1080p",
    supportsAudio: true,
    supportsImageToVideo: true,
    supportsMultiShot: false,
    pricingSourceUrl: "https://docs.dev.runwayml.com/guides/pricing/",
    envKeyRequired: "RUNWAY_API_KEY",
    description: "Professional creative control and extendable shots.",
  },
  {
    id: "seedance-2",
    label: "Seedance 2.0",
    provider: "fal",
    generationMode: "generative",
    pricePerSecondUsd: 0.3,
    maxDurationSec: 15,
    resolution: "720p",
    supportsAudio: true,
    supportsImageToVideo: true,
    supportsMultiShot: false,
    pricingSourceUrl: "https://fal.ai/learn/tools/seedance-2-0-vs-kling-3-0",
    envKeyRequired: "FAL_API_KEY",
    description: "Multimodal reference inputs — great for e-commerce style ads.",
  },
];

const DEFAULT_ALLOWLIST =
  "clip-compose,nova-reel-1-1,luma-ray-2-540p,luma-ray-2-720p,kling-3-pro,veo-3-1-fast,runway-gen4-turbo,runway-gen4-5";

/** Nova 2 Lite planner cost per draft/iteration (~2k tokens). */
export const PROMO_AD_PLANNER_COST_USD = 0.01;

export function isPromoAdModelConfigured(model: PromoAdModelInfo): boolean {
  if (!model.envKeyRequired) return true;
  return Boolean(process.env[model.envKeyRequired]?.trim());
}

export function listPromoAdModels(): PromoAdModelInfo[] {
  const raw = process.env.PROMO_AD_MODELS || DEFAULT_ALLOWLIST;
  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return PROMO_AD_MODEL_CATALOG.filter(
    (m) => allowed.has(m.id) && isPromoAdModelConfigured(m)
  );
}

export function resolvePromoAdModel(id: string): PromoAdModelInfo | null {
  return listPromoAdModels().find((m) => m.id === id) ?? null;
}

export function rateForModel(
  model: PromoAdModelInfo,
  audioEnabled: boolean
): number {
  if (model.generationMode === "clip_compose") return 0;
  if (audioEnabled && model.priceWithAudioUsd != null) {
    return model.priceWithAudioUsd;
  }
  return model.pricePerSecondUsd;
}

/** Seconds actually billed by the generative backend for a requested duration. */
export function billableGenerativeDuration(
  model: PromoAdModelInfo,
  durationSeconds: number
): number {
  if (model.id.startsWith("luma-ray-2-")) {
    return durationSeconds >= 7 ? 9 : 5;
  }

  let duration = Math.max(6, Math.min(model.maxDurationSec, Math.round(durationSeconds)));
  duration = Math.floor(duration / 6) * 6;
  if (model.id === "nova-reel-1-1" && duration > 6 && duration < 12) {
    duration = 12;
  }
  return duration;
}

export type PromoAdEstimateInput = {
  mode: "CLIP_COMPOSE" | "GENERATIVE";
  modelId?: string;
  durationSeconds: number;
  audioEnabled?: boolean;
  includePlanner?: boolean;
  clipCount?: number;
};

export type PromoAdEstimate = {
  mode: "CLIP_COMPOSE" | "GENERATIVE";
  durationSeconds: number;
  breakdown: {
    videoGenerationUsd: number;
    promptPlannerUsd: number;
  };
  totalUsd: number;
  formula: string;
  wallTimeEstimate: string;
  model?: PromoAdModelInfo;
  catalogVersion: string;
};

export function estimatePromoAdCost(input: PromoAdEstimateInput): PromoAdEstimate {
  const includePlanner = input.includePlanner !== false;

  if (input.mode === "CLIP_COMPOSE") {
    const bodyDuration = Math.max(1, Math.round(input.durationSeconds));
    const introOutro = 5;
    const totalDuration = bodyDuration + introOutro;
    return {
      mode: "CLIP_COMPOSE",
      durationSeconds: totalDuration,
      breakdown: {
        videoGenerationUsd: 0,
        promptPlannerUsd: 0,
      },
      totalUsd: 0,
      formula: "Clip compose — no generative API charges (compute only)",
      wallTimeEstimate: "~30s–3min depending on clip count",
      model: resolvePromoAdModel("clip-compose") ?? undefined,
      catalogVersion: PROMO_AD_CATALOG_VERSION,
    };
  }

  const model = input.modelId ? resolvePromoAdModel(input.modelId) : null;
  if (!model || model.generationMode !== "generative") {
    throw new Error("Invalid or unavailable generative model");
  }

  const duration = billableGenerativeDuration(model, input.durationSeconds);
  const rate = rateForModel(model, Boolean(input.audioEnabled));
  const videoUsd = Math.round(rate * duration * 100) / 100;
  const plannerUsd = includePlanner ? PROMO_AD_PLANNER_COST_USD : 0;
  const totalUsd = Math.round((videoUsd + plannerUsd) * 100) / 100;

  const audioNote = input.audioEnabled && model.supportsAudio ? " (audio on)" : "";
  const formula = `${duration}s × $${rate.toFixed(3)}/s${audioNote}${
    plannerUsd > 0 ? ` + planner $${plannerUsd.toFixed(2)}` : ""
  }`;

  let wallTime = "~2–5 min";
  if (duration >= 60) wallTime = "~8–17 min";
  else if (duration >= 30) wallTime = "~4–10 min";
  else if (duration <= 8) wallTime = "~1–3 min";

  return {
    mode: "GENERATIVE",
    durationSeconds: duration,
    breakdown: {
      videoGenerationUsd: videoUsd,
      promptPlannerUsd: plannerUsd,
    },
    totalUsd,
    formula,
    wallTimeEstimate: wallTime,
    model,
    catalogVersion: PROMO_AD_CATALOG_VERSION,
  };
}

export const DEFAULT_GENERATIVE_MODEL_ID = "nova-reel-1-1";
