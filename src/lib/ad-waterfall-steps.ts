import type { AdWaterfallStep } from "@/lib/use-ad-waterfall";

/** Build ordered waterfall steps for in-video overlay slots. */
export function buildInVideoAdSteps(opts: {
  juicyInvideoZoneId?: string | null;
  exoInvideoZoneId?: string | null;
  juicyBannerZoneId?: string | null;
  exoBannerZoneId?: string | null;
  exoInsClass?: string | null;
  invideoWidth?: number;
  invideoHeight?: number;
}): AdWaterfallStep[] {
  const steps: AdWaterfallStep[] = [];
  const insClass = opts.exoInsClass;

  if (opts.juicyInvideoZoneId) {
    steps.push({
      kind: "juicy",
      zoneId: opts.juicyInvideoZoneId,
      width: opts.invideoWidth ?? 300,
      height: opts.invideoHeight ?? 100,
    });
  }
  if (opts.exoInvideoZoneId) {
    steps.push({
      kind: "exo",
      zoneId: opts.exoInvideoZoneId,
      width: opts.invideoWidth ?? 300,
      height: opts.invideoHeight ?? 100,
      insClass,
    });
  }
  if (opts.juicyBannerZoneId) {
    steps.push({ kind: "juicy", zoneId: opts.juicyBannerZoneId, width: 300, height: 250 });
  }
  if (opts.exoBannerZoneId && opts.exoBannerZoneId !== opts.exoInvideoZoneId) {
    steps.push({ kind: "exo", zoneId: opts.exoBannerZoneId, width: 300, height: 250, insClass });
  }

  return steps;
}

/** Build ordered waterfall steps for floating corner / sidebar-style banners. */
export function buildCornerAdSteps(opts: {
  juicyZoneId?: string | null;
  exoFallbackZoneId?: string | null;
  juicyBannerZoneId?: string | null;
  exoInsClass?: string | null;
  width?: number;
  height?: number;
}): AdWaterfallStep[] {
  const steps: AdWaterfallStep[] = [];
  const w = opts.width ?? 300;
  const h = opts.height ?? 250;
  const insClass = opts.exoInsClass;

  if (opts.juicyZoneId) {
    steps.push({ kind: "juicy", zoneId: opts.juicyZoneId, width: w, height: h });
  }
  if (opts.exoFallbackZoneId) {
    steps.push({ kind: "exo", zoneId: opts.exoFallbackZoneId, width: w, height: h, insClass });
  }
  if (opts.juicyBannerZoneId && opts.juicyBannerZoneId !== opts.juicyZoneId) {
    steps.push({ kind: "juicy", zoneId: opts.juicyBannerZoneId, width: 300, height: 250 });
  }

  return steps;
}

/** Build BannerAdSlot waterfall (Exo ↔ Juicy with optional tertiary Exo zone). */
export function buildBannerAdSteps(opts: {
  exoZoneId?: string | null;
  juicyZoneId?: string | null;
  exoSecondaryZoneId?: string | null;
  juicyEnabled?: boolean;
  preferJuicy?: boolean;
  insClass?: string | null;
  width?: number;
  height?: number;
}): AdWaterfallStep[] {
  const steps: AdWaterfallStep[] = [];
  const hasJuicy = Boolean(opts.juicyEnabled && opts.juicyZoneId);
  const hasExo = Boolean(opts.exoZoneId);
  const hasExo2 = Boolean(opts.exoSecondaryZoneId && opts.exoSecondaryZoneId !== opts.exoZoneId);
  const w = opts.width ?? 300;
  const h = opts.height ?? 250;
  const insClass = opts.insClass;

  if (opts.preferJuicy && hasJuicy) {
    steps.push({ kind: "juicy", zoneId: opts.juicyZoneId!, width: w, height: h });
    if (hasExo) steps.push({ kind: "exo", zoneId: opts.exoZoneId!, width: w, height: h, insClass });
  } else if (hasExo) {
    steps.push({ kind: "exo", zoneId: opts.exoZoneId!, width: w, height: h, insClass });
    if (hasJuicy) steps.push({ kind: "juicy", zoneId: opts.juicyZoneId!, width: w, height: h });
  } else if (hasJuicy) {
    steps.push({ kind: "juicy", zoneId: opts.juicyZoneId!, width: w, height: h });
  }

  if (hasExo2) {
    steps.push({
      kind: "exo",
      zoneId: opts.exoSecondaryZoneId!,
      width: w,
      height: h,
      insClass,
    });
  }

  return steps;
}
