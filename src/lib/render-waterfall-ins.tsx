"use client";

import type { RefObject } from "react";
import JuicyFrame from "@/components/ads/JuicyFrame";
import { EXO_INS_CLASS } from "@/lib/exo-click";
import type { AdWaterfallStep } from "@/lib/use-ad-waterfall";

export function renderWaterfallIns(
  step: AdWaterfallStep | null,
  insRef: RefObject<HTMLElement | null>
) {
  if (!step) return null;

  if (step.kind === "juicy") {
    return (
      <JuicyFrame
        frameRef={insRef as RefObject<HTMLIFrameElement>}
        zoneId={step.zoneId}
        width={step.width}
        height={step.height}
        className="ad-slot-fill"
      />
    );
  }

  const w = step.width ?? 300;
  const h = step.height ?? 250;
  return (
    <ins
      ref={insRef as RefObject<HTMLModElement>}
      className={step.insClass || EXO_INS_CLASS}
      data-zoneid={step.zoneId}
      style={{ display: "block", width: w, height: h, maxWidth: "100%" }}
    />
  );
}
