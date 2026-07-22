"use client";

import BannerAdSlot from "@/components/ads/BannerAdSlot";
import { EXO_INS_CLASS } from "@/lib/exo-click";

/**
 * ExoClick display ad slot with optional JuicyAds + tertiary Exo fallback.
 */
export default function AdZone({
  zoneId,
  className = "",
  minHeight,
  label = true,
  insClass = EXO_INS_CLASS,
  juicyFallbackZoneId,
  exoSecondaryZoneId,
  juicyEnabled = true,
  preferJuicy = false,
}: {
  zoneId?: string | null;
  className?: string;
  minHeight?: number;
  label?: boolean;
  insClass?: string | null;
  juicyFallbackZoneId?: string | null;
  /** Extra Exo zone (e.g. home banner) when under-player + Juicy both empty. */
  exoSecondaryZoneId?: string | null;
  juicyEnabled?: boolean;
  preferJuicy?: boolean;
}) {
  if (!zoneId && !(juicyEnabled && juicyFallbackZoneId)) return null;

  return (
    <BannerAdSlot
      exoZoneId={zoneId}
      juicyZoneId={juicyFallbackZoneId}
      exoSecondaryZoneId={exoSecondaryZoneId}
      juicyEnabled={juicyEnabled}
      insClass={insClass}
      preferJuicy={preferJuicy}
      minHeight={minHeight ?? 90}
      label={label}
      className={className}
    />
  );
}
