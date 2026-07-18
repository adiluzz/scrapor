import type { PromoAdGenerationMode } from "@prisma/client";

export type PromoAdModelParams = {
  durationSeconds?: number;
  seed?: number;
  taskType?: "TEXT_VIDEO" | "MULTI_SHOT_AUTOMATED";
  logoPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  logoOpacity?: number;
  showTagline?: boolean;
  /** Animated intro/outro with the site logo (default for CLIP_COMPOSE). */
  brandIntroOutro?: boolean;
  /** Corner watermark on the full video — off by default when intro/outro is used. */
  logoOverlay?: boolean;
  /** Domain shown on outro tagline (e.g. fbbtube.com). */
  taglineDomain?: string;
  audioEnabled?: boolean;
  maxBodySeconds?: number;
  crossfadeSec?: number;
  kenBurns?: boolean;
  removeSourceLogos?: boolean;
  logoRemovalMode?: "presets" | "auto" | "both";
  /** When true, compiled output is linked on the public tube (VideoSite + READY). Default off for editor exports. */
  publishToSite?: boolean;
  /** Output canvas aspect for CLIP_COMPOSE (from editor crop majority). */
  outputAspect?: "16:9" | "9:16";
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
          brandIntroOutro: true,
          logoOverlay: false,
          publishToSite: false,
          maxBodySeconds: 60,
          logoOpacity: 0.9,
          crossfadeSec: 0.5,
          kenBurns: false,
          removeSourceLogos: true,
          logoRemovalMode: "both",
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
