"use client";

import { EXO_INS_CLASS } from "@/lib/exo-click";
import { buildBannerAdSteps } from "@/lib/ad-waterfall-steps";
import { renderWaterfallIns } from "@/lib/render-waterfall-ins";
import { useAdWaterfall } from "@/lib/use-ad-waterfall";

/**
 * Banner slot with Exo ↔ Juicy waterfall (+ optional tertiary Exo zone).
 * Hides completely when no network fills — no empty placeholders.
 */
export default function BannerAdSlot({
  exoZoneId,
  juicyZoneId,
  exoSecondaryZoneId,
  juicyEnabled = true,
  insClass = EXO_INS_CLASS,
  preferJuicy = false,
  minHeight = 90,
  width = 300,
  height = 250,
  label = true,
  className = "",
  fillTimeoutMs = 6000,
}: {
  exoZoneId?: string | null;
  juicyZoneId?: string | null;
  exoSecondaryZoneId?: string | null;
  juicyEnabled?: boolean;
  insClass?: string | null;
  preferJuicy?: boolean;
  minHeight?: number;
  width?: number;
  height?: number;
  label?: boolean;
  className?: string;
  fillTimeoutMs?: number;
}) {
  const steps = buildBannerAdSteps({
    exoZoneId,
    juicyZoneId,
    exoSecondaryZoneId,
    juicyEnabled,
    preferJuicy,
    insClass,
    width,
    height: Math.max(height, minHeight),
  });

  const { instanceId, insRef, step, filled, hidden, stepIndex } = useAdWaterfall(steps, {
    timeoutMs: fillTimeoutMs,
  });

  if (steps.length === 0 || hidden) return null;

  return (
    <div
      className={filled ? `ad-slot ${className}` : `pointer-events-none h-0 overflow-hidden opacity-0 ${className}`}
      aria-hidden={!filled}
    >
      {filled && label && (
        <span className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Advertisement</span>
      )}
      <div key={`${stepIndex}-${step?.kind}-${step?.zoneId}`}>
        {renderWaterfallIns(step, insRef, instanceId)}
      </div>
    </div>
  );
}
