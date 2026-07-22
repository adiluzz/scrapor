"use client";

import { useState } from "react";
import { EXO_INS_CLASS } from "@/lib/exo-click";
import { buildCornerAdSteps } from "@/lib/ad-waterfall-steps";
import { renderWaterfallIns } from "@/lib/render-waterfall-ins";
import { useAdWaterfall } from "@/lib/use-ad-waterfall";

/**
 * Dismissible floating corner ad with Juicy → Exo → Juicy banner waterfall.
 * Hidden until filled; never shows an empty box.
 */
export default function FloatingCornerAd({
  zoneId,
  enabled = true,
  exoFallbackZoneId,
  juicyBannerZoneId,
  exoInsClass = EXO_INS_CLASS,
}: {
  zoneId?: string | null;
  enabled?: boolean;
  exoFallbackZoneId?: string | null;
  juicyBannerZoneId?: string | null;
  exoInsClass?: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);

  const steps = buildCornerAdSteps({
    juicyZoneId: zoneId,
    exoFallbackZoneId,
    juicyBannerZoneId,
    exoInsClass,
  });

  const { instanceId, insRef, step, filled, hidden, stepIndex } = useAdWaterfall(
    enabled && !dismissed ? steps : [],
    { timeoutMs: 6000 }
  );

  if (!enabled || dismissed || hidden || steps.length === 0) return null;

  return (
    <div
      className={
        filled
          ? "fixed bottom-4 right-4 z-40 hidden lg:block"
          : "pointer-events-none fixed -left-[9999px] top-0 opacity-0"
      }
      aria-hidden={!filled}
    >
      <div className="relative rounded-lg border border-zinc-800 bg-zinc-950/95 p-1 shadow-xl">
        {filled && (
          <button
            type="button"
            aria-label="Dismiss ad"
            onClick={() => setDismissed(true)}
            className="absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        )}
        <div className="ad-slot" key={`${stepIndex}-${step?.kind}-${step?.zoneId}`}>
          {renderWaterfallIns(step, insRef, instanceId)}
        </div>
      </div>
    </div>
  );
}
