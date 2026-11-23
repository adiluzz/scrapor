"use client";

import { useEffect, useState } from "react";
import { EXO_INS_CLASS } from "@/lib/exo-click";
import { buildBannerAdSteps } from "@/lib/ad-waterfall-steps";
import { renderWaterfallIns } from "@/lib/render-waterfall-ins";
import { useAdWaterfall } from "@/lib/use-ad-waterfall";

/**
 * Dismissible mobile sticky banner (bottom). Exo → Juicy waterfall; hidden on no-fill.
 */
export default function MobileStickyAd({
  zoneId,
  insClass = EXO_INS_CLASS,
  juicyZoneId,
  juicyEnabled = true,
}: {
  zoneId?: string | null;
  insClass?: string | null;
  juicyZoneId?: string | null;
  juicyEnabled?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setPhone(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const steps = buildBannerAdSteps({
    exoZoneId: zoneId,
    juicyZoneId,
    juicyEnabled,
    preferJuicy: false,
    insClass,
    width: 320,
    height: 50,
  });

  const { insRef, step, filled, hidden, stepIndex } = useAdWaterfall(
    dismissed || !phone ? [] : steps,
    { timeoutMs: 6000, placement: "mobile_sticky" }
  );

  if (dismissed || hidden || steps.length === 0) return null;

  return (
    <div
      className={
        filled
          ? "ad-slot-sticky fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 px-2 pb-2 pt-4 backdrop-blur sm:hidden"
          : "pointer-events-none fixed -left-[9999px] top-0 opacity-0 sm:hidden"
      }
      aria-hidden={!filled}
    >
      {filled && (
        <button
          type="button"
          aria-label="Dismiss ad"
          onClick={() => setDismissed(true)}
          className="absolute right-1 top-0 z-10 px-2 text-xs text-zinc-500 hover:text-zinc-300"
        >
          ✕
        </button>
      )}
      <div className="ad-slot mx-auto w-full max-w-full overflow-hidden">
        <div key={`${stepIndex}-${step?.kind}-${step?.zoneId}`}>
          {renderWaterfallIns(step, insRef)}
        </div>
      </div>
    </div>
  );
}
