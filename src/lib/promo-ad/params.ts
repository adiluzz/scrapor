import type { PromoAdGenerationMode } from "@prisma/client";

export type PromoAdModelParams = {
  durationSeconds?: number;
  seed?: number;
  taskType?: "TEXT_VIDEO" | "MULTI_SHOT_AUTOMATED";
  logoPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  logoOpacity?: number;
  showTagline?: boolean;
  audioEnabled?: boolean;
  maxBodySeconds?: number;
};

export function parseModelParams(raw: string | null | undefined): PromoAdModelParams {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PromoAdModelParams;
  } catch {
    return {};
  }
}

export function stringifyModelParams(params: PromoAdModelParams): string {
  return JSON.stringify(params);
}

export function defaultModelParams(
  mode: PromoAdGenerationMode,
  overrides?: PromoAdModelParams
): PromoAdModelParams {
  const base: PromoAdModelParams =
    mode === "CLIP_COMPOSE"
      ? {
          showTagline: true,
          maxBodySeconds: 60,
          logoOpacity: 0.9,
        }
      : {
          durationSeconds: 12,
          taskType: "MULTI_SHOT_AUTOMATED",
          logoPosition: "bottom-right",
          logoOpacity: 0.85,
          audioEnabled: false,
        };
  return { ...base, ...overrides };
}

export function promoAdS3Key(siteId: string, adId: string, iterationNumber: number): string {
  return `sites/${siteId}/promo-ads/${adId}/iter-${iterationNumber}.mp4`;
}
