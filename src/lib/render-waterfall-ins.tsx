"use client";

import type { RefObject } from "react";
import { EXO_INS_CLASS } from "@/lib/exo-click";
import type { AdWaterfallStep } from "@/lib/use-ad-waterfall";

export function renderWaterfallIns(
  step: AdWaterfallStep | null,
  insRef: RefObject<HTMLModElement | null>,
  instanceId: string
) {
  if (!step) return null;
  const ref = insRef as RefObject<HTMLModElement>;

  if (step.kind === "juicy") {
    return (
      <ins
        ref={ref}
        id={`juicy-${step.zoneId}-${instanceId}-${step.width}x${step.height}`}
        data-adzone={step.zoneId}
        data-width={step.width}
        data-height={step.height}
        className="ad-slot-fill inline-block max-w-full"
        style={{ display: "block", width: step.width, height: step.height, maxWidth: "100%" }}
      />
    );
  }

  const w = step.width ?? 300;
  const h = step.height ?? 250;
  return (
    <ins
      ref={ref}
      className={step.insClass || EXO_INS_CLASS}
      data-zoneid={step.zoneId}
      style={{ display: "block", width: w, height: h, maxWidth: "100%" }}
    />
  );
}
