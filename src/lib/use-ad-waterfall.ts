"use client";

import { useEffect, useId, useRef, useState } from "react";
import { watchAdFill } from "@/lib/ad-fill";
import { serveExoAds } from "@/lib/exo-click";
import { pushJuicyZone } from "@/lib/juicy-ads";

export type AdWaterfallStep =
  | { kind: "juicy"; zoneId: string; width: number; height: number }
  | { kind: "exo"; zoneId: string; width?: number; height?: number; insClass?: string | null };

type State = "loading" | "filled" | "hidden";

/**
 * Try ad network steps in order; hide the slot when none fill.
 * Returns filled=true only after a visible creative is detected.
 */
export function useAdWaterfall(
  steps: AdWaterfallStep[],
  { timeoutMs = 6000 }: { timeoutMs?: number } = {}
) {
  const instanceId = useId().replace(/:/g, "");
  const insRef = useRef<HTMLModElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<State>(steps.length ? "loading" : "hidden");

  const step = steps[stepIndex] ?? null;

  useEffect(() => {
    if (state !== "loading" || !step) return;

    let cancelled = false;

    const run = async () => {
      if (step.kind === "juicy") {
        pushJuicyZone(step.zoneId);
      } else {
        serveExoAds();
      }

      const empty = await watchAdFill(() => insRef.current, { timeoutMs });
      if (cancelled) return;

      if (!empty) {
        setState("filled");
        return;
      }

      if (stepIndex + 1 < steps.length) {
        setStepIndex((i) => i + 1);
      } else {
        setState("hidden");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [state, step, stepIndex, steps.length, timeoutMs]);

  return {
    instanceId,
    insRef,
    step,
    stepIndex,
    filled: state === "filled",
    hidden: state === "hidden",
    loading: state === "loading",
  };
}
