"use client";

import { useEffect, useId, useRef, useState } from "react";
import { watchAdFill } from "@/lib/ad-fill";
import { trackAdEvent } from "@/lib/ad-events";
import { adZoneKey, claimZone, releaseZone } from "@/lib/ad-zone-claim";
import { serveExoAds } from "@/lib/exo-click";
import { juicyFillRoot } from "@/lib/juicy-ads";

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
  { timeoutMs = 6000, placement }: { timeoutMs?: number; placement?: string } = {}
) {
  const instanceId = useId().replace(/:/g, "");
  const insRef = useRef<HTMLElement>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<State>(steps.length ? "loading" : "hidden");
  const reportedRef = useRef(false);
  const ownedKeyRef = useRef<string | null>(null);

  const step = steps[stepIndex] ?? null;
  const hidden = state === "hidden";
  const stepsKey = steps.map((s) => `${s.kind}:${s.zoneId}`).join("|");

  function report(name: "slot_filled" | "slot_empty", extra?: Record<string, string>) {
    if (!placement || reportedRef.current) return;
    reportedRef.current = true;
    trackAdEvent(name, { placement, ...extra });
  }

  // Steps start empty on desktop for the sticky bar, then appear after the
  // viewport check. Restart the waterfall when that list changes.
  useEffect(() => {
    reportedRef.current = false;
    setStepIndex(0);
    setState(steps.length ? "loading" : "hidden");
  }, [stepsKey, steps.length]);

  // Hold the zone id until this slot unmounts or moves to another step.
  // Releasing on "filled" would let a second slot steal the same Juicy id.
  useEffect(() => {
    if (!step || hidden) return;
    const key = adZoneKey(step.kind, step.zoneId);
    if (!claimZone(key)) {
      if (state === "loading") {
        if (stepIndex + 1 < steps.length) setStepIndex((i) => i + 1);
        else {
          setState("hidden");
          report("slot_empty");
        }
      }
      return;
    }
    ownedKeyRef.current = key;
    return () => {
      if (ownedKeyRef.current === key) {
        releaseZone(key);
        ownedKeyRef.current = null;
      }
    };
    // `state === "loading"` is read only for the already-claimed skip path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.kind, step?.zoneId, hidden, stepIndex, steps.length]);

  useEffect(() => {
    if (state !== "loading" || !step) return;
    const key = adZoneKey(step.kind, step.zoneId);
    if (ownedKeyRef.current !== key) return;

    let cancelled = false;

    const run = async () => {
      // Juicy loads inside its own frame (see JuicyFrame). Never inject jads.js here.
      if (step.kind === "exo") serveExoAds();

      const empty = await watchAdFill(() => juicyFillRoot(insRef.current), { timeoutMs });
      if (cancelled) return;

      if (!empty) {
        setState("filled");
        report("slot_filled", { network: step.kind, zone_id: step.zoneId });
        return;
      }

      if (stepIndex + 1 < steps.length) {
        setStepIndex((i) => i + 1);
      } else {
        setState("hidden");
        report("slot_empty");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // `step` identity changes every render; key the run off the zone actually claimed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, step?.kind, step?.zoneId, stepIndex, steps.length, timeoutMs, placement]);

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
