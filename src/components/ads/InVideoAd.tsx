"use client";

import { useEffect } from "react";
import { EXO_INS_CLASS } from "@/lib/exo-click";
import { buildInVideoAdSteps } from "@/lib/ad-waterfall-steps";
import { renderWaterfallIns } from "@/lib/render-waterfall-ins";
import { useAdWaterfall } from "@/lib/use-ad-waterfall";

/**
 * Dismissible in-video overlay with multi-network waterfall. Hidden until a
 * creative loads; removed entirely when every step is empty.
 */
export default function InVideoAd({
  zoneId,
  exoFallbackZoneId,
  juicyBannerZoneId,
  exoBannerZoneId,
  exoInsClass = EXO_INS_CLASS,
  width = 300,
  height = 100,
  onDismiss,
}: {
  zoneId?: string | null;
  exoFallbackZoneId?: string | null;
  juicyBannerZoneId?: string | null;
  exoBannerZoneId?: string | null;
  exoInsClass?: string | null;
  width?: number;
  height?: number;
  onDismiss: () => void;
}) {
  const steps = buildInVideoAdSteps({
    juicyInvideoZoneId: zoneId,
    exoInvideoZoneId: exoFallbackZoneId,
    juicyBannerZoneId,
    exoBannerZoneId,
    exoInsClass,
    invideoWidth: width,
    invideoHeight: height,
  });

  const { instanceId, insRef, step, filled, hidden, stepIndex } = useAdWaterfall(steps, {
    timeoutMs: 5500,
  });

  useEffect(() => {
    if (hidden) onDismiss();
  }, [hidden, onDismiss]);

  if (hidden || steps.length === 0) return null;

  return (
    <div
      className={
        filled
          ? "relative rounded-md bg-black/60 p-1 backdrop-blur-sm"
          : "pointer-events-none fixed -left-[9999px] top-0 opacity-0"
      }
      aria-hidden={!filled}
    >
      {filled && (
        <button
          type="button"
          aria-label="Dismiss ad"
          onClick={onDismiss}
          className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900/95 text-[10px] text-zinc-300 ring-1 ring-zinc-700 hover:text-white"
        >
          ✕
        </button>
      )}
      <div className="ad-slot" key={`${stepIndex}-${step?.kind}-${step?.zoneId}`}>
        {renderWaterfallIns(step, insRef, instanceId)}
      </div>
    </div>
  );
}
