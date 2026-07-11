"use client";

import { useEffect } from "react";
import { EXO_INS_CLASS, serveExoAds } from "@/lib/exo-click";

/**
 * ExoClick Desktop Fullpage Interstitial on the video watch page.
 *
 * Create a "Desktop Fullpage Interstitial" zone in ExoClick and set
 * `site.exoZoneVideoFullscreen`. ExoClick will show a fullscreen overlay
 * when the page loads (frequency/capping is configured in the ExoClick panel).
 *
 * The `<ins>` is a zero-size anchor — the creative is injected as an overlay by
 * ad-provider.js (already loaded in the site layout).
 */
export default function ExoFullscreenOverlay({
  zoneId,
  insClass = EXO_INS_CLASS,
}: {
  zoneId?: string | null;
  insClass?: string | null;
}) {
  const resolvedClass = insClass || EXO_INS_CLASS;

  useEffect(() => {
    if (!zoneId) return;
    serveExoAds();
  }, [zoneId]);

  if (!zoneId) return null;

  return (
    <ins
      className={resolvedClass}
      data-zoneid={zoneId}
      aria-hidden="true"
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
        border: 0,
        padding: 0,
        margin: 0,
      }}
    />
  );
}
